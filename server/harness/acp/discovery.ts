// Session list, model catalog and home-card preview over ACP. Provider-agnostic.
import { realpath } from 'node:fs/promises'

import type { Model, SessionInfo } from '@/lib/types'

import { type AcpProviderConfig, type AcpSpawnContext, liveAcpFirstUserText } from './session'
import { acpSessionToSessionInfo } from './adapter'
import { archiveAcpSession, archivedAcpSessions } from './archived'
import { type AcpClient, getAcpClient, peekAcpClient, releaseAcpClient } from './client'
import {
  cacheAcpModelState,
  clearAcpModelCache,
  peekAcpModelState,
  storeAcpModelState
} from './model-state'
import type { ListSessionsResponse, AcpModelState, AcpNewSessionResult } from './wire'
import type { WorkspaceActivityPreview } from '../types'
import { debug } from '../../debug'

const PAGE_LIMIT = 100

// Single-session agents must never use an active chat for discovery.
async function discoveryClient(config: AcpProviderConfig, ctx: AcpSpawnContext) {
  return getAcpClient({
    ...(await config.spawn(ctx)),
    ...(config.processScope === 'session' ? { scope: `discovery:${crypto.randomUUID()}` } : {})
  })
}

// `session/list` is stateless, so a single-session agent can serve it from one
// shared process instead of a new one per call: every chat end refreshes the
// list in each open tab. The process stays warm as long as an idle chat does.
const LIST_IDLE_MS = 10 * 60_000
const listIdleTimers = new Map<string, ReturnType<typeof setTimeout>>()

async function listClient(config: AcpProviderConfig, ctx: AcpSpawnContext) {
  const spec = await config.spawn(ctx)
  if (config.processScope !== 'session') return getAcpClient(spec)
  const key = `${config.id}:${ctx.workspacePath}`
  clearTimeout(listIdleTimers.get(key))
  listIdleTimers.delete(key)
  return getAcpClient({ ...spec, scope: 'discovery:list' })
}

function releaseListClientLater(
  config: AcpProviderConfig,
  ctx: AcpSpawnContext,
  client: AcpClient
) {
  if (config.processScope !== 'session') return
  const key = `${config.id}:${ctx.workspacePath}`
  clearTimeout(listIdleTimers.get(key))
  const timer = setTimeout(() => {
    listIdleTimers.delete(key)
    releaseAcpClient(client)
  }, LIST_IDLE_MS)
  timer.unref?.()
  listIdleTimers.set(key, timer)
}

// Sessions whose recorded cwd is this workspace, newest first. `cwd` filtering
// and cursor pagination are both server-side in ACP.
export async function listAcpSessions(
  config: AcpProviderConfig,
  ctx: AcpSpawnContext
): Promise<SessionInfo[]> {
  let client: AcpClient | undefined
  try {
    client = await listClient(config, ctx)
    const cwd = await realpath(ctx.workspacePath).catch(() => ctx.workspacePath)
    // Archiving is moi-side (see ./archived.ts) — the backend still lists the
    // chat, so it is filtered here rather than by the agent.
    const archived = await archivedAcpSessions(ctx.workspacePath)
    const out: SessionInfo[] = []
    const ids = new Set<string>()
    const cursors = new Set<string>()
    let cursor: string | undefined
    for (let page = 0; page < PAGE_LIMIT; page++) {
      const res: ListSessionsResponse = await client.rpc('session/list', {
        cwd,
        ...(cursor ? { cursor } : {})
      })
      for (const entry of res.sessions ?? []) {
        if (
          entry.sessionId &&
          !archived.has(entry.sessionId) &&
          !ids.has(entry.sessionId) &&
          (!entry.cwd || entry.cwd === ctx.workspacePath || entry.cwd === cwd)
        ) {
          ids.add(entry.sessionId)
          out.push(
            acpSessionToSessionInfo(
              entry,
              entry.title?.trim()
                ? undefined
                : liveAcpFirstUserText(ctx.workspaceId, entry.sessionId)
            )
          )
        }
      }
      if (!res.nextCursor || cursors.has(res.nextCursor)) break
      cursors.add(res.nextCursor)
      cursor = res.nextCursor
    }
    return out.sort((a, b) => b.lastModified - a.lastModified)
  } catch (err) {
    debug(`${config.id} session/list failed: ${err instanceof Error ? err.message : String(err)}`)
    return []
  } finally {
    if (client) releaseListClientLater(config, ctx, client)
  }
}

// Home-page card preview. Peek-only: ACP agents are slow to start (seconds),
// and this runs for every card on the home screen. With no live process the
// card simply omits the activity fields until the workspace is opened once.
export async function acpWorkspacePreview(
  config: AcpProviderConfig,
  ctx: AcpSpawnContext,
  includeFirstUserMessage: boolean
): Promise<WorkspaceActivityPreview> {
  const client = await peekAcpClient(ctx.workspacePath, config.id)
  if (!client) return {}
  try {
    const cwd = await realpath(ctx.workspacePath).catch(() => ctx.workspacePath)
    const res: ListSessionsResponse = await client.rpc('session/list', { cwd })
    const archived = await archivedAcpSessions(ctx.workspacePath)
    const rows = (res.sessions ?? []).filter(
      s =>
        s.sessionId &&
        !archived.has(s.sessionId) &&
        (!s.cwd || s.cwd === ctx.workspacePath || s.cwd === cwd)
    )
    if (rows.length === 0) return {}
    const newest = rows.reduce((a, b) =>
      Date.parse(b.updatedAt ?? '') > Date.parse(a.updatedAt ?? '') ? b : a
    )
    const updated = Date.parse(newest.updatedAt ?? '')
    // The oldest session's title stands in for its first user message — ACP
    // exposes no message preview, and titles are generated from that message.
    const oldest = rows.reduce((a, b) =>
      Date.parse(b.updatedAt ?? '') < Date.parse(a.updatedAt ?? '') ? b : a
    )
    return {
      ...(Number.isNaN(updated) ? {} : { updatedAt: updated }),
      ...(includeFirstUserMessage && oldest.title ? { firstUserMessage: oldest.title } : {})
    }
  } catch {
    return {}
  }
}

// The model catalog arrives inline on `session/new`, so there is no standalone
// list RPC. Read it through the per-workspace cache (./model-state.ts): the
// first picker snapshot pays for one throwaway session, every chat moi starts
// afterwards refreshes the cache for free, and a provider fingerprint catches a
// default changed outside moi in between.
async function discoverAcpModelState(
  config: AcpProviderConfig,
  ctx: AcpSpawnContext
): Promise<AcpModelState | undefined> {
  const client = await discoveryClient(config, ctx)
  try {
    const created = await client.rpc<AcpNewSessionResult>('session/new', {
      cwd: ctx.workspacePath,
      mcpServers: []
    })
    // This exact session exists only to inspect the catalog. Hide its empty
    // row in moi while leaving the provider's own history intact.
    if (created.sessionId) await archiveAcpSession(ctx.workspacePath, created.sessionId)
    return config.modelState?.(created) ?? created.models ?? undefined
  } finally {
    if (config.processScope === 'session') releaseAcpClient(client)
  }
}

const probes = new Map<string, Promise<void>>()

// A provider may advertise a model's selectors (fx: its effort levels) only
// once a session uses that model. Probe a catalog model the picker has not
// seen yet on a throwaway discovery session, so its first chat can already
// choose effort. Runs at most once at a time per workspace and model.
export async function probeAcpModel(
  config: AcpProviderConfig,
  ctx: AcpSpawnContext,
  modelId: string
): Promise<void> {
  const probeModelOptions = config.probeModelOptions
  if (!probeModelOptions) return
  const fingerprint = await config.modelStateFingerprint?.(ctx)
  const known = async () => {
    const pending = peekAcpModelState(ctx.workspacePath, fingerprint, config.id)
    return pending ? await pending.catch(() => undefined) : undefined
  }
  let base = await known()
  if (!base) {
    await listAcpModels(config, ctx)
    base = await known()
  }
  if (
    !base?.availableModels?.some(model => model.modelId === modelId) ||
    base.configOptionsByModel?.[modelId]
  ) {
    return
  }
  const key = `${config.id}:${ctx.workspacePath}:${modelId}`
  let pending = probes.get(key)
  if (!pending) {
    pending = (async () => {
      const client = await discoveryClient(config, ctx)
      try {
        const created = await client.rpc<AcpNewSessionResult>('session/new', {
          cwd: ctx.workspacePath,
          mcpServers: []
        })
        if (!created.sessionId) return
        await archiveAcpSession(ctx.workspacePath, created.sessionId)
        const observed = await probeModelOptions(client, created.sessionId, modelId)
        const options = observed?.configOptionsByModel?.[modelId]
        const latest = await known()
        // Merge only this model's selectors; the workspace default and the
        // other models' known choices stay as they were.
        if (options && latest) {
          cacheAcpModelState(
            ctx.workspacePath,
            { ...latest, configOptionsByModel: { [modelId]: options } },
            fingerprint,
            config.id
          )
        }
      } finally {
        if (config.processScope === 'session') releaseAcpClient(client)
      }
    })().finally(() => probes.delete(key))
    probes.set(key, pending)
  }
  await pending
}

export async function listAcpModels(
  config: AcpProviderConfig,
  ctx: AcpSpawnContext
): Promise<Model[]> {
  // Read the fingerprint before the RPC so a change racing the discovery
  // invalidates the next lookup instead of hiding behind a fresher stamp.
  const fingerprint = await config.modelStateFingerprint?.(ctx)
  let state = peekAcpModelState(ctx.workspacePath, fingerprint, config.id)
  if (!state) {
    state = discoverAcpModelState(config, ctx).catch(err => {
      clearAcpModelCache(ctx.workspacePath, config.id)
      throw err
    })
    storeAcpModelState(ctx.workspacePath, state, fingerprint, config.id)
  }
  const mapModels =
    config.mapModels ??
    ((modelState: AcpModelState): Model[] =>
      (modelState.availableModels ?? []).map(m => ({
        value: m.modelId,
        displayName: m.name ?? m.modelId,
        ...(m.description ? { description: m.description } : {})
      })))
  try {
    return mapModels((await state) ?? {})
  } catch (err) {
    debug(`${config.id} model catalog failed: ${err instanceof Error ? err.message : String(err)}`)
    return []
  }
}
