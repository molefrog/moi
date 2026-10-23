import type { WorkspaceState, WorkspaceTabId } from '@/lib/types'
import { readWorkspaceState, updateWorkspaceState, type WorkspaceRef } from '../workspace-state'

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

export async function getPinnedSession(ws: WorkspaceRef): Promise<string | undefined> {
  return (await readWorkspaceState(ws)).pinnedSessionId
}

export async function pinSession(ws: WorkspaceRef, sessionId: string): Promise<void> {
  await updateWorkspaceState(ws, state => {
    state.pinnedSessionId = resolveRenamedSession(ws.id, sessionId)
  })
}

// Unpins only when `sessionId` is still the pinned chat.
export async function unpinSession(ws: WorkspaceRef, sessionId: string): Promise<void> {
  await updateWorkspaceState(ws, state => {
    if (state.pinnedSessionId === resolveRenamedSession(ws.id, sessionId))
      delete state.pinnedSessionId
  })
}

// Show `sessionId` in `tabId` inside a state transaction. With `ifMatch`, only
// when the tab still shows that chat (null: no chat), so a stale client
// cannot undo a newer choice. Returns whether the tab changed.
export function selectSessionForTab(
  state: WorkspaceState,
  workspaceId: string,
  sessionId: string,
  tabId: WorkspaceTabId,
  ifMatch?: string | null
): boolean {
  const current = state.selected[tabId] ?? null
  const expected = ifMatch == null ? ifMatch : resolveRenamedSession(workspaceId, ifMatch)
  if (expected !== undefined && current !== expected) return false
  const next = resolveRenamedSession(workspaceId, sessionId)
  if (current === next) return false
  state.selected[tabId] = next
  return true
}

export async function saveSelectedSession(
  ws: WorkspaceRef,
  sessionId: string,
  tabId: WorkspaceTabId = 'overview',
  ifMatch?: string | null
): Promise<boolean> {
  return updateWorkspaceState(ws, state =>
    selectSessionForTab(state, ws.id, sessionId, tabId, ifMatch)
  )
}

// Clears `tabId` only while it still shows `sessionId`; the tab then opens a
// new chat.
export async function deselectSession(
  ws: WorkspaceRef,
  sessionId: string,
  tabId: WorkspaceTabId
): Promise<void> {
  await updateWorkspaceState(ws, state => {
    if (state.selected[tabId] === resolveRenamedSession(ws.id, sessionId))
      delete state.selected[tabId]
  })
}

export async function dropSessionTab(ws: WorkspaceRef, tabId: WorkspaceTabId): Promise<void> {
  await updateWorkspaceState(ws, state => {
    delete state.selected[tabId]
  })
}

// Follow a temporary id's rename in every tab and the pin.
export function renameSessionSelection(state: WorkspaceState, from: string, to: string): void {
  for (const [tabId, sessionId] of Object.entries(state.selected) as [WorkspaceTabId, string][]) {
    if (sessionId === from) state.selected[tabId] = to
  }
  if (state.pinnedSessionId === from) state.pinnedSessionId = to
}

// Remove an archived chat from every tab and the pin.
export function clearSessionSelection(state: WorkspaceState, sessionId: string): void {
  for (const [tabId, selected] of Object.entries(state.selected) as [WorkspaceTabId, string][]) {
    if (selected === sessionId) delete state.selected[tabId]
  }
  if (state.pinnedSessionId === sessionId) delete state.pinnedSessionId
}

export async function clearSelectedSession(ws: WorkspaceRef, sessionId: string): Promise<void> {
  await updateWorkspaceState(ws, state => clearSessionSelection(state, sessionId))
}
