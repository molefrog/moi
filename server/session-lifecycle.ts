import { renameSessionRecord } from './session-store'
import { renameSelectedSession } from './selected-session'
import { renameViewExecutionSession } from './pending-views'
import { broadcast } from './state'

export async function renameSessionReferences(
  workspaceId: string,
  workspacePath: string,
  from: string,
  to: string
) {
  if (from === to) return
  await renameSessionRecord(workspacePath, from, to)
  await renameSelectedSession(workspacePath, from, to)
  await renameViewExecutionSession(workspaceId, workspacePath, from, to)
  broadcast(workspaceId, { type: 'session_renamed', from, to })
}
