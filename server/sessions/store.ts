import type { WorkspaceSessionState, WorkspaceState, WorkspaceTabId } from '@/lib/types'
import { readWorkspaceState, updateWorkspaceState, type WorkspaceRef } from '../workspace-state'

export async function getSessionEntries(
  ws: WorkspaceRef
): Promise<Record<string, WorkspaceSessionState>> {
  return (await readWorkspaceState(ws)).sessions
}

export async function getSessionEntry(
  ws: WorkspaceRef,
  sessionId: string
): Promise<WorkspaceSessionState> {
  return (await readWorkspaceState(ws)).sessions[sessionId] ?? {}
}

// Merge `patch` into a session entry inside a state transaction. An undefined
// field clears it.
export function patchSessionEntry(
  state: WorkspaceState,
  sessionId: string,
  patch: Partial<WorkspaceSessionState>
): void {
  state.sessions[sessionId] = { ...state.sessions[sessionId], ...patch }
}

export function setSessionTab(state: WorkspaceState, sessionId: string, tabId: WorkspaceTabId) {
  patchSessionEntry(state, sessionId, { tabId: tabId === 'overview' ? undefined : tabId })
}

export async function updateSessionEntry(
  ws: WorkspaceRef,
  sessionId: string,
  patch: Partial<WorkspaceSessionState>
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
