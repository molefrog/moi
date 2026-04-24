import { getSessionMessages, listSessions } from '@anthropic-ai/claude-agent-sdk'

import { ClaudeAdapter } from '@/lib/claude-adapter'
import type { ServerMessage, SessionInfo, StreamEvent } from '@/lib/types'

// Per-workspace connected chat clients
const clientsByWorkspace = new Map<string, Set<Bun.ServerWebSocket<unknown>>>()

export function addClient(workspaceId: string, ws: Bun.ServerWebSocket<unknown>) {
  if (!clientsByWorkspace.has(workspaceId)) clientsByWorkspace.set(workspaceId, new Set())
  clientsByWorkspace.get(workspaceId)!.add(ws)
}

export function removeClient(workspaceId: string, ws: Bun.ServerWebSocket<unknown>) {
  clientsByWorkspace.get(workspaceId)?.delete(ws)
}

// Per-session agent state — the ONLY mutable state
type Agent = { processing: boolean; abortController: AbortController | null }
const agents = new Map<string, Agent>()

export function getAgent(id: string): Agent {
  if (!agents.has(id)) agents.set(id, { processing: false, abortController: null })
  return agents.get(id)!
}

export function renameAgent(from: string, to: string) {
  const a = agents.get(from)
  if (!a) return
  agents.set(to, a)
  agents.delete(from)
}

export function getProcessingSessions(workspaceId: string): string[] {
  void workspaceId
  const result: string[] = []
  for (const [id, a] of agents) if (a.processing) result.push(id)
  return result
}

export function broadcast(workspaceId: string, msg: ServerMessage) {
  const json = JSON.stringify(msg)
  for (const ws of clientsByWorkspace.get(workspaceId) ?? []) ws.send(json)
}

export function broadcastAll(msg: ServerMessage) {
  const json = JSON.stringify(msg)
  for (const clients of clientsByWorkspace.values()) {
    for (const ws of clients) ws.send(json)
  }
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
      for (const ev of adapter.ingest(msg)) events.push(ev)
    }
  } catch {
    // session file missing or unreadable — return whatever we have (often [])
  }
  return events
}
