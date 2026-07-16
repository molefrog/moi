// OpenClaw as a Harness. Thin wiring over this folder's modules — see
// ../types.ts for the contract and ../README.md for the architecture.
import type { DiscoveredWorkspace } from '@/lib/types'

import type { Harness } from '../types'
import { toSessionInfo, toStreamEvents } from './adapter'
import {
  discoverOpenClawAgents,
  getOpenClawModels,
  getOpenClawSessionMessages,
  getOpenClawSessions
} from './discovery'
import {
  abortOpenClawRun,
  ensureOpenClawSessionLive,
  getLiveOpenClawEvents,
  getOpenClawRunningSessions,
  sendOpenClawMessage
} from './session'

export const openclawHarness: Harness = {
  id: 'openclaw',
  capabilities: {
    supportsStreaming: false, // durable message rows only — deliberate v2 cut
    imagesInline: 'path-note',
    liveModelSwitch: false,
    liveEffortSwitch: false,
    nativeUserEcho: true // gateway echoes sends (lagged); matched by text
  },

  sendMessage: async input => {
    if (!input.agentId) {
      throw new Error('OpenClaw workspace has no agentId — re-add it via discovery')
    }
    return sendOpenClawMessage({ ...input, agentId: input.agentId })
  },
  interrupt: (workspaceId, sessionId) => abortOpenClawRun({ workspaceId, sessionId }),
  runningSessions: () => getOpenClawRunningSessions(),

  listSessions: async ws => {
    const rows = await getOpenClawSessions(ws.path, ws.agentId)
    return rows.map(r => toSessionInfo(r, ws.path))
  },
  // Prefer the live view if we already hold one — keeps REST + WS in
  // agreement for any reload that lands while a run is active. The first cold
  // call also primes the live subscription so subsequent WS frames upsert
  // into the same view; the static transcript is the last resort.
  sessionEvents: async (ws, sessionId) => {
    const live = getLiveOpenClawEvents(ws.id, sessionId)
    if (live) return live
    if (ws.agentId) {
      try {
        return await ensureOpenClawSessionLive({
          workspaceId: ws.id,
          workspacePath: ws.path,
          agentId: ws.agentId,
          sessionId
        })
      } catch {
        // fall through to static path
      }
    }
    const preview = await getOpenClawSessionMessages(sessionId, ws.path, ws.agentId)
    return toStreamEvents(preview)
  },
  listModels: () => getOpenClawModels(),

  discoverWorkspaces: async registeredPaths => {
    const agents = await discoverOpenClawAgents()
    return agents
      .filter(a => !registeredPaths.has(a.path))
      .map(
        (a): DiscoveredWorkspace => ({
          path: a.path,
          type: 'openclaw',
          ...(a.name ? { name: a.name } : {}),
          ...(a.agentId ? { agentId: a.agentId } : {}),
          ...(a.isDefault ? { isDefault: a.isDefault } : {}),
          ...(a.lastRunAt ? { lastRunAt: a.lastRunAt } : {})
        })
      )
  },

  skillsDir: workspaceRoot => `${workspaceRoot}/skills`,

  statusLines: () => {
    const running = getOpenClawRunningSessions()
    return [
      `live OpenClaw runs  ${running.length}`,
      ...running.map(r => `  ▶ busy  ws=${r.workspaceId}  session=${r.sessionId}`)
    ]
  }
}
