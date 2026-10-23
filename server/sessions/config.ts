import type { SessionConfig } from '@/lib/types'
import { updateWorkspaceState, type WorkspaceRef } from '../workspace-state'
import { getSessionRecord } from './store'

// null clears a setting; undefined leaves it unchanged.
export type SessionConfigPatch = {
  model?: string | null
  effort?: string | null
  fastMode?: boolean | null
}

export async function getSessionConfig(
  ws: WorkspaceRef,
  sessionId: string
): Promise<SessionConfig> {
  return (await getSessionRecord(ws, sessionId)).config ?? {}
}

export async function hasSessionConfig(ws: WorkspaceRef, sessionId: string): Promise<boolean> {
  return Object.keys(await getSessionConfig(ws, sessionId)).length > 0
}

export async function saveSessionConfig(
  ws: WorkspaceRef,
  sessionId: string,
  patch: SessionConfigPatch
): Promise<SessionConfig> {
  return updateWorkspaceState(ws, state => {
    const session = (state.sessions[sessionId] ??= {})
    const config: SessionConfig = { ...session.config }
    for (const key of ['model', 'effort', 'fastMode'] as const) {
      if (patch[key] === null) delete config[key]
    }
    if (typeof patch.model === 'string') config.model = patch.model
    if (typeof patch.effort === 'string') config.effort = patch.effort
    if (typeof patch.fastMode === 'boolean') config.fastMode = patch.fastMode
    if (Object.keys(config).length) session.config = config
    else delete session.config
    return config
  })
}
