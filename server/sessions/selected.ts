import type { WorkspaceSessionSelection, WorkspaceTabId } from '@/lib/types'
import {
  readWorkspaceState,
  updateWorkspaceState,
  type WorkspaceRef,
  type WorkspaceState
} from '../workspace-state'

export type SelectedSessionUpdate = {
  changed: boolean
  sessionId: string | null
}

// Temporary ids the harnesses renamed, per workspace id. A request can still
// carry the old id after the rename landed.
const renamedSessions = new Map<string, Map<string, string>>()

export function forgetSessionRenames(): void {
  renamedSessions.clear()
}

export function rememberSessionRename(workspaceId: string, from: string, to: string): void {
  const renames = renamedSessions.get(workspaceId) ?? new Map<string, string>()
  renames.set(from, to)
  renamedSessions.set(workspaceId, renames)
}

export function resolveRenamedSession(workspaceId: string, sessionId: string): string {
  const renames = renamedSessions.get(workspaceId)
  const seen = new Set<string>()
  while (renames?.has(sessionId) && !seen.has(sessionId)) {
    seen.add(sessionId)
    sessionId = renames.get(sessionId)!
  }
  return sessionId
}

export async function getSelectedSession(
  ws: WorkspaceRef,
  tabId: WorkspaceTabId = 'overview'
): Promise<string | undefined> {
  return (await readWorkspaceState(ws)).selected[tabId]
}

export async function getWorkspaceSessionSelection(
  ws: WorkspaceRef
): Promise<WorkspaceSessionSelection> {
  const { selected, pinnedSessionId } = await readWorkspaceState(ws)
  return { selected, pinned: pinnedSessionId ?? null }
}

export async function getPinnedSession(ws: WorkspaceRef): Promise<string | null> {
  return (await readWorkspaceState(ws)).pinnedSessionId ?? null
}

export async function pinSession(ws: WorkspaceRef, sessionId: string | null): Promise<void> {
  await updateWorkspaceState(ws, state => {
    if (sessionId === null) delete state.pinnedSessionId
    else state.pinnedSessionId = resolveRenamedSession(ws.id, sessionId)
  })
}

export async function dropSessionTab(ws: WorkspaceRef, tabId: WorkspaceTabId): Promise<void> {
  await updateWorkspaceState(ws, state => {
    delete state.selected[tabId]
  })
}

// Point `tabId` at `sessionId` inside a state transaction. With
// `previousSessionId`, only when the tab still shows that chat, so a stale
// client cannot undo a newer choice.
export function selectSessionForTab(
  state: WorkspaceState,
  workspaceId: string,
  sessionId: string | null,
  previousSessionId?: string | null,
  tabId: WorkspaceTabId = 'overview'
): SelectedSessionUpdate {
  const current = state.selected[tabId] ?? null
  const resolvedSessionId =
    sessionId === null ? null : resolveRenamedSession(workspaceId, sessionId)
  const resolvedPreviousSessionId =
    previousSessionId == null
      ? previousSessionId
      : resolveRenamedSession(workspaceId, previousSessionId)

  if (resolvedPreviousSessionId !== undefined && current !== resolvedPreviousSessionId)
    return { changed: false, sessionId: current }
  if (current === resolvedSessionId) return { changed: false, sessionId: resolvedSessionId }

  if (resolvedSessionId === null) delete state.selected[tabId]
  else state.selected[tabId] = resolvedSessionId
  return { changed: true, sessionId: resolvedSessionId }
}

export async function saveSelectedSession(
  ws: WorkspaceRef,
  sessionId: string | null,
  previousSessionId?: string | null,
  tabId: WorkspaceTabId = 'overview'
): Promise<SelectedSessionUpdate> {
  return updateWorkspaceState(ws, state =>
    selectSessionForTab(state, ws.id, sessionId, previousSessionId, tabId)
  )
}

// Follow a temporary id's rename in every tab and the pin.
export function renameSessionSelection(state: WorkspaceState, from: string, to: string): void {
  for (const [tabId, sessionId] of Object.entries(state.selected) as [WorkspaceTabId, string][]) {
    if (sessionId === from) state.selected[tabId] = to
  }
  if (state.pinnedSessionId === from) state.pinnedSessionId = to
}

// Remove an archived chat from every tab and the pin.
export function clearSessionSelection(
  state: WorkspaceState,
  sessionId: string
): SelectedSessionUpdate {
  let changed = false
  for (const [tabId, selected] of Object.entries(state.selected) as [WorkspaceTabId, string][]) {
    if (selected !== sessionId) continue
    delete state.selected[tabId]
    changed = true
  }
  if (state.pinnedSessionId === sessionId) {
    delete state.pinnedSessionId
    changed = true
  }
  return { changed, sessionId: state.selected.overview ?? null }
}

export async function clearSelectedSession(
  ws: WorkspaceRef,
  sessionId: string
): Promise<SelectedSessionUpdate> {
  return updateWorkspaceState(ws, state => clearSessionSelection(state, sessionId))
}
