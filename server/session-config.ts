import type { SessionConfig } from '@/lib/types'
import { getSessionRecords, updateSessionRecords } from './session-store'

// null clears a setting; undefined leaves it unchanged.
export type SessionConfigPatch = {
  model?: string | null
  effort?: string | null
  fastMode?: boolean | null
}

export async function getSessionConfig(
  workspacePath: string,
  sessionId: string
): Promise<SessionConfig> {
  return (await getSessionRecords(workspacePath))[sessionId]?.config ?? {}
}

export async function hasSessionConfig(workspacePath: string, sessionId: string): Promise<boolean> {
  return Object.keys(await getSessionConfig(workspacePath, sessionId)).length > 0
}

export async function saveSessionConfig(
  workspacePath: string,
  sessionId: string,
  patch: SessionConfigPatch
): Promise<SessionConfig> {
  let config: SessionConfig = {}
  await updateSessionRecords(workspacePath, sessions => {
    const record = (sessions[sessionId] ??= {})
    config = { ...record.config }
    for (const key of ['model', 'effort', 'fastMode'] as const) {
      if (patch[key] === null) delete config[key]
    }
    if (typeof patch.model === 'string') config.model = patch.model
    if (typeof patch.effort === 'string') config.effort = patch.effort
    if (typeof patch.fastMode === 'boolean') config.fastMode = patch.fastMode
    if (Object.keys(config).length) record.config = config
    else delete record.config
  })
  return config
}
