// OpenClaw as a Harness. Thin wiring over this folder's modules — see
// ../types.ts for the contract and ../README.md for the architecture.
import type { DiscoveredWorkspaceCandidate, Harness } from '../types'
import { OPENCLAW_WIRE_SCOPE, getOpenClawGatewayStatus } from './gateway'
import { toSessionInfo, toStreamEvents } from './adapter'
import { cronRunsToStreamEvents, openClawCronJobIdFromKey } from './cron-view'
import {
  archiveOpenClawSession,
  discoverOpenClawAgents,
  getOpenClawCronRuns,
  getOpenClawModels,
  getOpenClawSessionMessages,
  getOpenClawSessions,
  getOpenClawWorkspacePreview,
  resolveOpenClawSessionKey
} from './discovery'
import {
  abortOpenClawRun,
  ensureOpenClawSessionLive,
  getLiveOpenClawEvents,
  getOpenClawActiveSessions,
  killAllOpenClawSessions,
  sendOpenClawMessage
} from './session'

export const openclawHarness: Harness = {
  id: 'openclaw',
  capabilities: {
    supportsStreaming: true, // `chat` delta frames → StreamPreview
    imagesInline: 'path-note',
    liveModelSwitch: true, // sessions.patch { model } before each send
    liveEffortSwitch: true, // sessions.patch { thinkingLevel }
    nativeUserEcho: true // echo matched by `<runId>:user` idempotency key, text fallback
  },

  sendMessage: async input => {
    if (!input.agentId) {
      throw new Error('OpenClaw workspace has no agentId — re-add it via discovery')
    }
    return sendOpenClawMessage({ ...input, agentId: input.agentId })
  },
  interrupt: (workspaceId, sessionId) => abortOpenClawRun({ workspaceId, sessionId }),
  // `sessions.patch { archived: true }`. 2026.6.x gateways reject the field
  // (their patch schema predates it and validates with
  // `additionalProperties: false`) — the RPC error propagates and the API
  // layer reports the archive as failed.
  archiveSession: (ws, sessionId) => archiveOpenClawSession(sessionId, ws.path, ws.agentId),
  activeSessions: () => getOpenClawActiveSessions(),

  listSessions: async ws => {
    const rows = await getOpenClawSessions(ws.path, ws.agentId)
    return rows.map(r => toSessionInfo(r, ws.path))
  },
  workspacePreview: (ws, includeFirstUserMessage) =>
    getOpenClawWorkspacePreview(ws.path, ws.agentId, includeFirstUserMessage),
  // Prefer the live view if we already hold one — keeps REST + WS in
  // agreement for any reload that lands while a run is active. The first cold
  // call also primes the live subscription so subsequent WS frames upsert
  // into the same view; the static transcript is the last resort. A session
  // that still comes back empty may be an isolated cron bucket — its per-run
  // transcripts are orphaned by the gateway's post-run session reset (see
  // cron-view.ts), so fall back to synthesizing turns from `cron.runs`.
  sessionEvents: async (ws, sessionId) => {
    const events = await (async () => {
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
    })()
    if (events.length > 0) return events
    const key = await resolveOpenClawSessionKey(sessionId, ws.path, ws.agentId)
    const jobId = key ? openClawCronJobIdFromKey(key) : null
    if (!jobId) return events
    return cronRunsToStreamEvents(await getOpenClawCronRuns(jobId))
  },
  listModels: () => getOpenClawModels(),

  discoverWorkspaces: async registeredPaths => {
    const agents = await discoverOpenClawAgents()
    return agents
      .filter(a => !registeredPaths.has(a.path))
      .map(
        (a): DiscoveredWorkspaceCandidate => ({
          path: a.path,
          type: 'openclaw'
        })
      )
  },

  // Server shutdown: tear down every live session (unsubscribe + stop ingest).
  // The shared gateway client is left running — process exit drops it. Invoked
  // from web.ts's SIGTERM/SIGINT handler via allHarnesses().shutdown().
  shutdown: () => killAllOpenClawSessions(),
  skillsDir: workspaceRoot => `${workspaceRoot}/skills`,

  // One process-global gateway connection → one shared wire-tap scope.
  wireScope: () => OPENCLAW_WIRE_SCOPE,

  statusLines: () => {
    const active = getOpenClawActiveSessions()
    const status = getOpenClawGatewayStatus()
    const gateway = status.connected
      ? `gateway  connected · protocol ${status.info?.protocol ?? '?'} · server ${status.info?.serverVersion ?? '?'}`
      : status.failure
        ? `gateway  ${status.failure.kind}: ${status.failure.message}`
        : 'gateway  not connected yet'
    return [
      gateway,
      `live OpenClaw runs  ${active.length}`,
      ...active.map(r => `  ▶ busy  ws=${r.workspaceId}  session=${r.sessionId}`)
    ]
  }
}
