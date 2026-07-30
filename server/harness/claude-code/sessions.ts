// Session discovery + history replay for Claude Code workspaces, backed by
// the Agent SDK's persisted `.jsonl` session files.
import { getSessionMessages, listSessions, tagSession } from '@anthropic-ai/claude-agent-sdk'
import type { SDKSessionInfo } from '@anthropic-ai/claude-agent-sdk'

import {
  attachmentOnlyFilenames,
  isAttachmentOnlyPlaceholder,
  splitAttachmentNote
} from '@/lib/attachment-note'
import { formatChatTitle } from '@/lib/chat-title'
import type { SessionInfo, StreamEvent } from '@/lib/types'

import { ClaudeAdapter } from './adapter'

export const MOI_ARCHIVED_SESSION_TAG = 'moi:archived'

export type SessionFirstPromptCandidate = {
  sessionId: string
  firstPrompt?: string
  createdAt?: number
  lastModified: number
}

export type SessionWorkspacePreview = {
  firstUserMessage?: string
  updatedAt?: number
}

export function claudeSessionSummary(
  session: Pick<SDKSessionInfo, 'customTitle' | 'firstPrompt' | 'summary'>
): string {
  if (session.customTitle || !session.firstPrompt || session.summary !== session.firstPrompt) {
    return session.summary
  }
  const split = splitAttachmentNote(session.firstPrompt)
  const filenames = isAttachmentOnlyPlaceholder(split.text)
    ? attachmentOnlyFilenames(split.text)
    : split.files.map(file => file.filename)
  return formatChatTitle(isAttachmentOnlyPlaceholder(split.text) ? '' : split.text, filenames)
}

export function visibleClaudeSessions<T extends Pick<SDKSessionInfo, 'tag'>>(sessions: T[]): T[] {
  return sessions.filter(session => session.tag !== MOI_ARCHIVED_SESSION_TAG)
}

export async function getSessions(workspacePath: string): Promise<SessionInfo[]> {
  const sessions = visibleClaudeSessions(await listSessions({ dir: workspacePath }))
  return sessions.map(s => ({
    sessionId: s.sessionId,
    summary: claudeSessionSummary(s),
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

export function selectLatestSessionUpdatedAt(
  sessions: Pick<SessionFirstPromptCandidate, 'lastModified'>[]
): number | undefined {
  return sessions.reduce<number | undefined>(
    (latest, session) =>
      latest === undefined || session.lastModified > latest ? session.lastModified : latest,
    undefined
  )
}

export async function getSessionWorkspacePreview(
  workspacePath: string,
  includeFirstUserMessage: boolean
): Promise<SessionWorkspacePreview> {
  const sessions = visibleClaudeSessions(await listSessions({ dir: workspacePath }))
  const updatedAt = selectLatestSessionUpdatedAt(sessions)
  const firstUserMessage = includeFirstUserMessage
    ? selectOldestSessionFirstUserMessage(sessions)
    : undefined

  return {
    ...(firstUserMessage ? { firstUserMessage } : {}),
    ...(updatedAt !== undefined ? { updatedAt } : {})
  }
}

export async function archiveClaudeSession(
  sessionId: string,
  workspacePath: string
): Promise<void> {
  await tagSession(sessionId, MOI_ARCHIVED_SESSION_TAG, { dir: workspacePath })
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
