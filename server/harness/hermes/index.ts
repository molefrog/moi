// Hermes Agent as a Harness, over ACP. Thin wiring: the protocol lives in
// ../acp/, this folder holds only what is Hermes-specific — profile discovery
// (the importable "agents"), the spawn command, and availability.
//
// See ./NOTES.md for the protocol research and the two backend quirks the ACP
// layer works around.
import type { DiscoveredWorkspaceCandidate, Harness } from '../types'
import type { HarnessAvailability } from '@/lib/types'

import { acpWorkspacePreview, listAcpModels, listAcpSessions } from '../acp/discovery'
import {
  type AcpProviderConfig,
  ensureAcpSessionLive,
  forgetAcpWorkspaceSessions,
  forgetAllAcpSessions,
  getAcpActiveSessions,
  getLiveAcpEvents,
  interruptAcpRun,
  sendAcpMessage
} from '../acp/session'
import { getAcpProcessInfo, killAcpWorkspace, killAllAcpClients } from '../acp/client'
import { DEFAULT_PROFILE, discoverHermesProfiles, resolveHermesProfile } from './discovery'
import { findHarnessExecutable, pathHarnessAvailability } from '../executable'

// Hermes ships three session modes; `dont_ask` is the one that auto-allows
// file edits without an approval round-trip, matching moi's
// bypass-permissions trust model (NOTES.md §3.5).
const NO_PROMPT_MODE = 'dont_ask'

const config: AcpProviderConfig = {
  id: 'hermes',
  provider: 'hermes',
  noPromptModeId: NO_PROMPT_MODE,
  supportsImages: true,
  async spawn(ctx) {
    const bin = findHarnessExecutable('hermes')
    if (!bin) throw new Error('hermes executable not found')
    // Profiles are separate agent identities; `-p` selects one. The default
    // profile takes no flag.
    const profile = await resolveHermesProfile(ctx.workspacePath, ctx.agentId)
    const agentId = profile?.agentId ?? ctx.agentId ?? DEFAULT_PROFILE
    const args = agentId === DEFAULT_PROFILE ? ['acp'] : ['-p', agentId, 'acp']
    return {
      provider: 'hermes',
      command: bin,
      args,
      workspacePath: ctx.workspacePath
    }
  }
}

function ctxOf(ws: { id: string; path: string; agentId?: string }) {
  return { workspaceId: ws.id, workspacePath: ws.path, agentId: ws.agentId }
}

export const hermesHarness: Harness = {
  id: 'hermes',
  capabilities: {
    supportsStreaming: true, // ACP always streams deltas; moi gates forwarding
    imagesInline: 'base64',
    // `session/set_model` works mid-session, but drops session-scoped MCP
    // servers (NOTES.md §3.10). Safe today because moi attaches none.
    liveModelSwitch: true,
    liveEffortSwitch: false, // ACP has no reasoning-effort concept
    nativeUserEcho: false // ACP never echoes the send; moi synthesizes the turn
  },

  sendMessage: input => sendAcpMessage(config, input),
  interrupt: (workspaceId, sessionId) => interruptAcpRun(config, { workspaceId, sessionId }),
  activeSessions: () => getAcpActiveSessions(),

  listSessions: ws => listAcpSessions(config, ctxOf(ws)),
  workspacePreview: (ws, includeFirstUserMessage) =>
    acpWorkspacePreview(config, ctxOf(ws), includeFirstUserMessage),
  // Prefer the live view when one exists; otherwise resume the session so WS
  // frames upsert into the same view. Replay is higher-fidelity than the live
  // stream here (NOTES.md §3.4), so there is no static fallback worth having.
  sessionEvents: async (ws, sessionId) => {
    const live = getLiveAcpEvents(ws.id, sessionId)
    if (live) return live
    try {
      return await ensureAcpSessionLive(config, { ...ctxOf(ws), sessionId })
    } catch {
      return []
    }
  },
  listModels: ws => listAcpModels(config, ctxOf(ws)),

  // Profiles moi has not imported yet. Like OpenClaw, agents are only ever
  // imported — `moi hermes init <profile>` is the install path, and there is
  // no create-from-UI flow.
  discoverWorkspaces: async registeredPaths => {
    const profiles = await discoverHermesProfiles()
    return profiles
      .filter(p => !registeredPaths.has(p.path))
      .map((p): DiscoveredWorkspaceCandidate => ({ path: p.path, type: 'hermes' }))
  },

  availability: async (ws): Promise<HarnessAvailability> => {
    const runtime = await pathHarnessAvailability('hermes')
    if (!runtime.available || !ws) return runtime
    const profile = await resolveHermesProfile(ws.path, ws.agentId)
    if (profile) return { available: true }
    return {
      available: false,
      reason: 'Hermes profile not found — run moi hermes init to re-import it',
      loginCommand: 'hermes profile list'
    }
  },

  onEnvChanged: workspacePath => {
    forgetAcpWorkspaceSessions(workspacePath)
    killAcpWorkspace(workspacePath)
  },
  shutdown: () => {
    forgetAllAcpSessions()
    killAllAcpClients()
  },
  // Hermes resolves <profile>/skills with the highest precedence, so moi's
  // skills land there and win over bundled ones.
  skillsDir: workspaceRoot => `${workspaceRoot}/skills`,
  debugInfo: ws => getAcpProcessInfo(ws.path, findHarnessExecutable('hermes')),
  wireScope: ws => ws.path,

  statusLines: () => {
    const active = getAcpActiveSessions()
    return [
      `hermes executable  ${findHarnessExecutable('hermes') ?? '(not found)'}`,
      `live Hermes runs  ${active.length}`,
      ...active.map(r => `  ▶ busy  ws=${r.workspaceId}  session=${r.sessionId}`)
    ]
  }
}
