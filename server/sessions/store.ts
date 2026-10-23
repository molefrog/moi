import type {
  SessionInfo,
  SessionRecord,
  SessionRecordPatch,
  SessionSummary,
  WorkspaceTabId
} from '@/lib/types'
import {
  readWorkspaceState,
  updateWorkspaceState,
  type WorkspaceRef,
  type WorkspaceSessionState,
  type WorkspaceState
} from '../workspace-state'

// The API keeps fork fields flat on the record; the state file groups them.
function toSessionRecord(session: WorkspaceSessionState | undefined): SessionRecord {
  if (!session) return {}
  const { fork, ...rest } = session
  if (!fork) return rest
  return {
    ...rest,
    forkedFromSessionId: fork.fromSessionId,
    ...(fork.throughMessageId ? { forkedThroughMessageId: fork.throughMessageId } : {}),
    ...(fork.noticeIds ? { forkedNoticeIds: fork.noticeIds } : {})
  }
}

function fromSessionRecord(record: SessionRecord): WorkspaceSessionState {
  const { forkedFromSessionId, forkedThroughMessageId, forkedNoticeIds, ...rest } = record
  if (forkedFromSessionId === undefined) {
    if (forkedThroughMessageId !== undefined || forkedNoticeIds !== undefined)
      throw new Error('Fork history requires a source session')
    return rest
  }
  return {
    ...rest,
    fork: {
      fromSessionId: forkedFromSessionId,
      ...(forkedThroughMessageId ? { throughMessageId: forkedThroughMessageId } : {}),
      ...(forkedNoticeIds ? { noticeIds: forkedNoticeIds } : {})
    }
  }
}

export async function getSessionRecords(ws: WorkspaceRef): Promise<Record<string, SessionRecord>> {
  const { sessions } = await readWorkspaceState(ws)
  return Object.fromEntries(
    Object.entries(sessions).map(([sessionId, session]) => [sessionId, toSessionRecord(session)])
  )
}

export async function getSessionRecord(
  ws: WorkspaceRef,
  sessionId: string
): Promise<SessionRecord> {
  return toSessionRecord((await readWorkspaceState(ws)).sessions[sessionId])
}

export async function withSessionRecords(
  ws: WorkspaceRef,
  sessions: SessionSummary[]
): Promise<SessionInfo[]> {
  const records = await getSessionRecords(ws)
  return sessions.map(session => {
    const { config: _, ...metadata } = records[session.sessionId] ?? {}
    return { ...session, ...metadata }
  })
}

// Merge `patch` into a session entry inside a state transaction.
export function patchSessionEntry(
  state: WorkspaceState,
  sessionId: string,
  patch: SessionRecordPatch
): void {
  state.sessions[sessionId] = fromSessionRecord({
    ...toSessionRecord(state.sessions[sessionId]),
    ...patch
  })
}

export function setSessionTab(state: WorkspaceState, sessionId: string, tabId: WorkspaceTabId) {
  patchSessionEntry(state, sessionId, { tabId: tabId === 'overview' ? undefined : tabId })
}

export async function patchSessionRecord(
  ws: WorkspaceRef,
  sessionId: string,
  patch: SessionRecordPatch
): Promise<void> {
  await updateWorkspaceState(ws, state => patchSessionEntry(state, sessionId, patch))
}

// A temporary id became the harness's real one. Settings saved under either id
// survive, the real id's winning, and forks of the old id follow it.
export function renameSessionEntry(state: WorkspaceState, from: string, to: string): void {
  if (from === to) return
  const source = state.sessions[from]
  if (source) {
    const target = state.sessions[to]
    const config =
      source.config || target?.config ? { ...source.config, ...target?.config } : undefined
    state.sessions[to] = { ...source, ...target, ...(config ? { config } : {}) }
    delete state.sessions[from]
  }
  for (const session of Object.values(state.sessions)) {
    if (session.fork?.fromSessionId === from) session.fork.fromSessionId = to
  }
}
