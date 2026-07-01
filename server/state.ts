import { getSessionMessages, listSessions } from '@anthropic-ai/claude-agent-sdk'

import { ClaudeAdapter } from '@/lib/claude-adapter'
import type { BroadcastFrame, ServerMessage, SessionInfo, StreamEvent } from '@/lib/types'

// The chat socket is app-wide (one per client tab, not per workspace), so a
// single set of all connected chat clients is enough. Each broadcast frame
// carries its `workspaceId`, and the client routes it.
const chatClients = new Set<Bun.ServerWebSocket<unknown>>()

export function addClient(ws: Bun.ServerWebSocket<unknown>) {
  chatClients.add(ws)
}

export function removeClient(ws: Bun.ServerWebSocket<unknown>) {
  chatClients.delete(ws)
}

// Connected chat clients (browser tabs), surfaced by /status.
export function getClientCount(): number {
  return chatClients.size
}

// Stamp `workspaceId` onto the frame and fan it out to every connected chat
// client. (Phase 1: broadcast-all; Phase 2 will scope by topic subscription.)
export function broadcast(workspaceId: string, frame: BroadcastFrame) {
  const json = JSON.stringify({ ...frame, workspaceId })
  for (const ws of chatClients) ws.send(json)
}

export function broadcastAll(msg: ServerMessage) {
  const json = JSON.stringify(msg)
  for (const ws of chatClients) ws.send(json)
}

export function sendToClient(ws: Bun.ServerWebSocket<unknown>, msg: ServerMessage) {
  ws.send(JSON.stringify(msg))
}

export async function getSessions(workspacePath: string): Promise<SessionInfo[]> {
  const sessions = await listSessions({ dir: workspacePath })
  return sessions.map(s => ({
    sessionId: s.sessionId,
    summary: s.summary,
    lastModified: s.lastModified,
    cwd: s.cwd
  }))
}

/**
 * Replay a session's persisted raw messages through a fresh adapter and
 * return the resulting StreamEvents. Events are carefully NOT deduplicated —
 * the client reducer is idempotent under upsert-by-id.
 */
export async function getSessionEvents(
  sessionId: string,
  workspacePath: string
): Promise<StreamEvent[]> {
  const adapter = new ClaudeAdapter()
  const events: StreamEvent[] = []
  try {
    const raw = await getSessionMessages(sessionId, { dir: workspacePath })
    for (const msg of raw) {
      // Disk replay carries no `stream_event` messages, so the adapter never
      // produces previews here — filter defensively to keep this the pure,
      // persisted StreamEvent path that reconnect-healing trusts.
      for (const ev of adapter.ingest(msg)) if (ev.kind !== 'preview') events.push(ev)
    }
  } catch {
    // session file missing or unreadable — return whatever we have (often [])
  }
  return events
}
