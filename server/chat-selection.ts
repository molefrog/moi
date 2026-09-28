import type { SelectedSessionScope, WorkspaceEntry } from '@/lib/types'

import { publishEvent } from './events'
import { saveSelectedSession } from './selected-session'

// A new chat updates the shared selection only when this tab uses that scope.
export async function selectChatSession(
  workspace: Pick<WorkspaceEntry, 'id' | 'path'>,
  sessionId: string,
  selectedSessionScope: SelectedSessionScope = 'shared',
  previousSessionId?: string | null
): Promise<void> {
  if (selectedSessionScope === 'browser-tab') return
  const selection = await saveSelectedSession(workspace.path, sessionId, previousSessionId)
  if (selection.changed) {
    publishEvent({
      type: 'selected-session:updated',
      workspaceId: workspace.id,
      sessionId: selection.sessionId
    })
  }
}
