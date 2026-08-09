// Session list, model catalog and home-card preview over ACP. Provider-agnostic.
import type { Model, SessionInfo } from '@/lib/types'

import { type AcpProviderConfig, type AcpSpawnContext } from './session'
import { acpSessionToSessionInfo } from './adapter'
import { getAcpClient, peekAcpClient } from './client'
import type { AcpListSessionsResult, AcpModelState, AcpNewSessionResult } from './wire'
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
    const out: SessionInfo[] = []
    let cursor: string | undefined
    for (let page = 0; page < PAGE_LIMIT; page++) {
      const res: AcpListSessionsResult = await client.rpc('session/list', {
        cwd: ctx.workspacePath,
        ...(cursor ? { cursor } : {})
      })
      for (const entry of res.sessions ?? []) {
        if (entry.sessionId) out.push(acpSessionToSessionInfo(entry))
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
    const res: AcpListSessionsResult = await client.rpc('session/list', { cwd: ctx.workspacePath })
    const rows = (res.sessions ?? []).filter(s => s.sessionId)
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
// list RPC. Cache it per workspace: creating a session just to read models is
// wasteful, and an empty session is invisible to `session/list` anyway (agents
// skip zero-history rows).
const modelCatalogs = new Map<string, Promise<AcpModelState | undefined>>()

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
  let cached = modelCatalogs.get(ctx.workspacePath)
  if (!cached) {
    cached = (async () => {
      const client = await getAcpClient(await config.spawn(ctx))
      const created = await client.rpc<AcpNewSessionResult>('session/new', {
        cwd: ctx.workspacePath,
        mcpServers: []
      })
      return created.models
    })().catch(err => {
      modelCatalogs.delete(ctx.workspacePath)
      throw err
    })
    modelCatalogs.set(ctx.workspacePath, cached)
  }
  try {
    const state = await cached
    return (state?.availableModels ?? []).map(
      (m): Model => ({
        value: m.modelId,
        displayName: m.name ?? m.modelId,
        ...(m.description ? { description: m.description } : {})
      })
    )
  } catch (err) {
    debug(`${config.id} model catalog failed: ${err instanceof Error ? err.message : String(err)}`)
    return []
  }
}
