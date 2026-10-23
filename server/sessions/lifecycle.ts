import { updateWorkspaceState, type WorkspaceRef } from '../workspace-state'
import { broadcast } from '../state'
import { renameBuildSession, viewsChanged } from './pending-views'
import { rememberSessionRename, renameSessionSelection } from './selected'
import { renameSessionEntry } from './store'

// A harness replaced the client's temporary id with its real one. The chat's
// settings, the tabs and pin showing it, and any view it builds all move in
// one write, so a crash cannot leave them pointing at different ids.
export async function renameSessionReferences(ws: WorkspaceRef, from: string, to: string) {
  if (from === to) return
  rememberSessionRename(ws.id, from, to)
  const buildsMoved = await updateWorkspaceState(ws, state => {
    renameSessionEntry(state, from, to)
    renameSessionSelection(state, from, to)
    return renameBuildSession(state, from, to)
  })
  if (buildsMoved) viewsChanged(ws.id)
  broadcast(ws.id, { type: 'session_renamed', from, to })
}
