// Session discovery + history replay for Claude Code workspaces, backed by
// the Agent SDK's persisted `.jsonl` session files.
import { getSessionMessages, listSessions } from '@anthropic-ai/claude-agent-sdk'

import type { SessionInfo, StreamEvent } from '@/lib/types'

import { ClaudeAdapter } from './adapter'

export type SessionFirstPromptCandidate = {
  sessionId: string
  firstPrompt?: string
  createdAt?: number
  lastModified: number
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

export function selectOldestSessionFirstUserMessage(
  sessions: SessionFirstPromptCandidate[]
): string | undefined {
  const oldest = sessions
    .slice()
    .sort(
      (a, b) =>
        (a.createdAt ?? a.lastModified) - (b.createdAt ?? b.lastModified) ||
        a.sessionId.localeCompare(b.sessionId)
    )[0]
  return oldest?.firstPrompt
}

export async function getOldestSessionFirstUserMessage(
  workspacePath: string
): Promise<string | undefined> {
  const sessions = await listSessions({ dir: workspacePath })
  return selectOldestSessionFirstUserMessage(sessions)
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
