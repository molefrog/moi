// Codex as a Harness. Thin wiring over this folder's modules — see
// ../types.ts for the contract and ../README.md for the architecture.
import type { Harness } from '../types'
import { pathHarnessAvailability } from '../executable'
import {
  getCodexMcpStatus,
  getCodexModels,
  getCodexProcessInfo,
  getCodexSessions,
  getCodexThreadEvents,
  getCodexWorkspacePreview,
  killAllCodexClients,
  killCodexWorkspace
} from './client'
import { discoverCodexWorkspaces } from './discovery'
import {
  ensureCodexSessionLive,
  getCodexActiveSessions,
  getLiveCodexEvents,
  interruptCodexRun,
  sendCodexMessage
} from './session'

export const codexHarness: Harness = {
  id: 'codex',
  capabilities: {
    supportsStreaming: true, // app-server always streams deltas; moi gates forwarding
    imagesInline: 'data-url',
    liveModelSwitch: true, // per-turn override becomes the thread default
    liveEffortSwitch: true,
    nativeUserEcho: true // clientUserMessageId echoes back as clientId
  },

  sendMessage: input => sendCodexMessage(input),
  interrupt: (workspaceId, sessionId) => interruptCodexRun({ workspaceId, sessionId }),
  activeSessions: () => getCodexActiveSessions(),

  listSessions: ws => getCodexSessions(ws.path),
  workspacePreview: (ws, includeFirstUserMessage) =>
    getCodexWorkspacePreview(ws.path, includeFirstUserMessage),
  // Prefer the live view when one exists; otherwise resume the thread so WS
  // frames upsert into the same view, and fall back to a static thread/read
  // if the resume fails.
  sessionEvents: async (ws, sessionId) => {
    const live = getLiveCodexEvents(ws.id, sessionId)
    if (live) return live
    try {
      return await ensureCodexSessionLive({
        workspaceId: ws.id,
        workspacePath: ws.path,
        sessionId
      })
    } catch {
      return getCodexThreadEvents(ws.path, sessionId)
    }
  },
  listModels: ws => getCodexModels(ws.path),
  mcpStatus: ws => getCodexMcpStatus(ws.path),
  discoverWorkspaces: registeredPaths => discoverCodexWorkspaces(registeredPaths),
  availability: async () => pathHarnessAvailability('codex'),

  onEnvChanged: workspacePath => killCodexWorkspace(workspacePath),
  shutdown: () => killAllCodexClients(),
  skillsDir: workspaceRoot => `${workspaceRoot}/.agents/skills`,
  debugInfo: ws => getCodexProcessInfo(ws.path),
  wireScope: ws => ws.path,

  statusLines: () => {
    const active = getCodexActiveSessions()
    return [
      `live Codex runs  ${active.length}`,
      ...active.map(r => `  ▶ busy  ws=${r.workspaceId}  session=${r.sessionId}`)
    ]
  }
}
