import { mkdir, rename, rm } from 'node:fs/promises'
import { dirname } from 'node:path'

import type { PendingView, SessionFork, WorkspaceSessionState } from '@/lib/types'
import { isWorkspaceTabId } from '@/lib/workspace-tabs'
import { LockTimeoutError, type Lease } from './lock'
import { WORKSPACE_STATE_VERSION, type StoredWorkspaceState } from './types'

type PendingViewState = Omit<PendingView, 'id'>

export type LoadedState = {
  state: StoredWorkspaceState
  // False for a file written by a newer Moi: read what we understand, never
  // overwrite what we don't.
  writable: boolean
}

export class WorkspaceStateVersionError extends Error {
  constructor(path: string) {
    super(`${path} was written by a newer version of Moi. Update Moi to change this workspace.`)
  }
}

const PENDING_VIEW_STATUSES = new Set<string>(['draft', 'starting', 'submitted', 'failed'])

export function emptyWorkspaceState(workspacePath: string): StoredWorkspaceState {
  return {
    version: WORKSPACE_STATE_VERSION,
    workspacePath,
    revision: 0,
    selected: {},
    sessions: {},
    pendingViews: {}
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function normalizeFork(value: unknown): SessionFork | undefined {
  if (!isRecord(value) || typeof value.fromSessionId !== 'string') return undefined
  const noticeIds = Array.isArray(value.noticeIds)
    ? value.noticeIds.filter((id): id is string => typeof id === 'string')
    : undefined
  return {
    fromSessionId: value.fromSessionId,
    ...(typeof value.throughMessageId === 'string'
      ? { throughMessageId: value.throughMessageId }
      : {}),
    ...(noticeIds?.length ? { noticeIds } : {})
  }
}

function normalizeSession(value: unknown): WorkspaceSessionState {
  if (!isRecord(value)) return {}
  const session: WorkspaceSessionState = {}
  if (isWorkspaceTabId(value.tabId)) session.tabId = value.tabId
  if (isRecord(value.config)) {
    const { model, effort, fastMode } = value.config
    const config = {
      ...(typeof model === 'string' ? { model } : {}),
      ...(typeof effort === 'string' ? { effort } : {}),
      ...(typeof fastMode === 'boolean' ? { fastMode } : {})
    }
    if (Object.keys(config).length) session.config = config
  }
  const fork = normalizeFork(value.fork)
  if (fork) session.fork = fork
  return session
}

function normalizePendingView(value: unknown): PendingViewState | undefined {
  if (!isRecord(value) || !PENDING_VIEW_STATUSES.has(String(value.status))) return undefined
  const view: PendingViewState = {
    status: value.status as PendingViewState['status'],
    requirements: optionalString(value.requirements) ?? ''
  }
  for (const key of ['title', 'icon', 'buildSessionId', 'error'] as const) {
    const field = optionalString(value[key])
    if (field !== undefined) view[key] = field
  }
  return view
}

// Keep every entry we can make sense of and drop the rest, so one bad field
// never costs the whole workspace its state.
export function normalizeWorkspaceState(
  value: Record<string, unknown>,
  workspacePath: string
): StoredWorkspaceState {
  const state = emptyWorkspaceState(optionalString(value.workspacePath) ?? workspacePath)
  if (typeof value.revision === 'number' && Number.isSafeInteger(value.revision))
    state.revision = value.revision
  const pinned = optionalString(value.pinnedSessionId)
  if (pinned) state.pinnedSessionId = pinned
  if (isRecord(value.selected)) {
    for (const [tabId, sessionId] of Object.entries(value.selected)) {
      if (isWorkspaceTabId(tabId) && typeof sessionId === 'string')
        state.selected[tabId] = sessionId
    }
  }
  if (isRecord(value.sessions)) {
    for (const [sessionId, session] of Object.entries(value.sessions))
      state.sessions[sessionId] = normalizeSession(session)
  }
  if (isRecord(value.pendingViews)) {
    for (const [viewId, view] of Object.entries(value.pendingViews)) {
      const normalized = normalizePendingView(view)
      if (normalized) state.pendingViews[viewId] = normalized
    }
  }
  return compactWorkspaceState(state)
}

// Empty session entries and settings carry no information; leaving them out
// keeps the file readable.
export function compactWorkspaceState<T extends StoredWorkspaceState>(state: T): T {
  for (const [sessionId, session] of Object.entries(state.sessions)) {
    for (const key of Object.keys(session) as (keyof WorkspaceSessionState)[])
      if (session[key] === undefined) delete session[key]
    if (session.config && Object.keys(session.config).length === 0) delete session.config
    if (Object.keys(session).length === 0) delete state.sessions[sessionId]
  }
  if (!state.pinnedSessionId) delete state.pinnedSessionId
  return state
}

async function setAside(path: string, reason: string): Promise<undefined> {
  const aside = `${path}.corrupt-${Date.now()}`
  await rename(path, aside).catch(() => {})
  console.error(`[workspace-state] ${reason}; moved ${path} to ${aside} and started empty`)
  return undefined
}

// Reads one state file. A missing file reads as undefined. A damaged file is
// moved aside instead of being overwritten by the next write.
export async function readStateFile(
  path: string,
  workspacePath: string
): Promise<LoadedState | undefined> {
  const file = Bun.file(path)
  if (!(await file.exists())) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(await file.text())
  } catch {
    return setAside(path, 'Unreadable JSON')
  }
  if (!isRecord(parsed) || typeof parsed.version !== 'number')
    return setAside(path, 'Not a workspace state file')
  const writable = parsed.version <= WORKSPACE_STATE_VERSION
  if (!writable) console.warn(`[workspace-state] ${new WorkspaceStateVersionError(path).message}`)
  return { state: normalizeWorkspaceState(parsed, workspacePath), writable }
}

let tempSequence = 0

// Write to a sibling temp file, then rename over the target: readers see the
// old file or the new one, never a partial write. A holder whose lock expired
// gives up before the rename, so a late write cannot replace a newer one.
export async function writeStateFile(path: string, state: StoredWorkspaceState, lease: Lease) {
  await mkdir(dirname(path), { recursive: true })
  const temp = `${path}.${process.pid}.${++tempSequence}.tmp`
  try {
    await Bun.write(temp, `${JSON.stringify(state, null, 2)}\n`)
    if (!lease.isCurrent()) throw new LockTimeoutError(path)
    await rename(temp, path)
  } finally {
    await rm(temp, { force: true })
  }
}
