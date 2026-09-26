import type { WorkspaceEntry } from '@/lib/types'

import { publishEvent } from './events'
import { saveSelectedSession } from './selected-session'

// Starting a chat can select it for this installation, but a browser with
// personal selection has already selected it locally and must not move peers.
export async function selectChatSession(
  workspace: Pick<WorkspaceEntry, 'id' | 'path'>,
  sessionId: string,
  personalSelection = false,
  previousSessionId?: string | null
): Promise<void> {
  if (personalSelection) return
  const selection = await saveSelectedSession(workspace.path, sessionId, previousSessionId)
  if (selection.changed) {
    publishEvent({
      type: 'selected-session:updated',
      workspaceId: workspace.id,
      sessionId: selection.sessionId
    })
  }
}
