// Session list, model catalog and home-card preview over ACP. Provider-agnostic.
import type { Model, SessionInfo } from '@/lib/types'

import { type AcpProviderConfig, type AcpSpawnContext } from './session'
import { acpSessionToSessionInfo } from './adapter'
import { archivedAcpSessions } from './archived'
import { getAcpClient, peekAcpClient } from './client'
import type { ListSessionsResponse, AcpModelState, AcpNewSessionResult } from './wire'
import type { WorkspaceActivityPreview } from '../types'
import { debug } from '../../debug'

const PAGE_LIMIT = 5

// Sessions whose recorded cwd is this workspace, newest first. `cwd` filtering
// and cursor pagination are both server-side in ACP.
export async function listAcpSessions(
  config: AcpProviderConfig,
  ctx: AcpSpawnContext
): Promise<SessionInfo[]> {
  try {
    const client = await getAcpClient(await config.spawn(ctx))
    // Archiving is moi-side (see ./archived.ts) — the backend still lists the
    // chat, so it is filtered here rather than by the agent.
    const archived = await archivedAcpSessions(ctx.workspacePath)
    const out: SessionInfo[] = []
    let cursor: string | undefined
    for (let page = 0; page < PAGE_LIMIT; page++) {
      const res: ListSessionsResponse = await client.rpc('session/list', {
        cwd: ctx.workspacePath,
        ...(cursor ? { cursor } : {})
      })
      for (const entry of res.sessions ?? []) {
        if (entry.sessionId && !archived.has(entry.sessionId)) {
          out.push(acpSessionToSessionInfo(entry))
        }
      }
      if (!res.nextCursor) break
      cursor = res.nextCursor
    }
    return out.sort((a, b) => b.lastModified - a.lastModified)
  } catch (err) {
    debug(`${config.id} session/list failed: ${err instanceof Error ? err.message : String(err)}`)
    return []
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
  const client = await peekAcpClient(ctx.workspacePath)
  if (!client) return {}
  try {
    const res: ListSessionsResponse = await client.rpc('session/list', { cwd: ctx.workspacePath })
    const archived = await archivedAcpSessions(ctx.workspacePath)
    const rows = (res.sessions ?? []).filter(s => s.sessionId && !archived.has(s.sessionId))
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
// list RPC. Cache it per workspace by default: creating a session just to read
// models is wasteful, and an empty session is invisible to `session/list`
// anyway (agents skip zero-history rows). Providers whose state includes a
// mutable external default can opt into refreshing it on each picker snapshot.
const modelCatalogs = new Map<string, Promise<AcpModelState | undefined>>()

async function discoverAcpModelState(
  config: AcpProviderConfig,
  ctx: AcpSpawnContext
): Promise<AcpModelState | undefined> {
  const client = await getAcpClient(await config.spawn(ctx))
  const created = await client.rpc<AcpNewSessionResult>('session/new', {
    cwd: ctx.workspacePath,
    mcpServers: []
  })
  return created.models ?? undefined
}

export function cacheAcpModelState(workspacePath: string, models: AcpModelState | undefined): void {
  if (models?.availableModels?.length) {
    modelCatalogs.set(workspacePath, Promise.resolve(models))
  }
}

export function clearAcpModelCache(workspacePath: string): void {
  modelCatalogs.delete(workspacePath)
}

export async function listAcpModels(
  config: AcpProviderConfig,
  ctx: AcpSpawnContext
): Promise<Model[]> {
  let statePromise: Promise<AcpModelState | undefined>
  if (config.refreshModelState) {
    statePromise = discoverAcpModelState(config, ctx)
  } else {
    let cached = modelCatalogs.get(ctx.workspacePath)
    if (!cached) {
      cached = discoverAcpModelState(config, ctx).catch(err => {
        modelCatalogs.delete(ctx.workspacePath)
        throw err
      })
      modelCatalogs.set(ctx.workspacePath, cached)
    }
    statePromise = cached
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
    const state = await statePromise
    return mapModels(state ?? {})
  } catch (err) {
    debug(`${config.id} model catalog failed: ${err instanceof Error ? err.message : String(err)}`)
    return []
  }
}
