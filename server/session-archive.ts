import type { WorkspaceEntry } from '@/lib/types'
import { viewTabId } from '@/lib/workspace-tabs'
import { publishEvent } from './events'
import { harnessFor } from './harness/registry'
import { clearSelectedSession, dropSessionTab } from './selected-session'
import { getSessionRecords } from './session-store'
import { broadcast } from './state'

export async function archiveWorkspaceSession(ws: WorkspaceEntry, sessionId: string) {
  const harness = harnessFor(ws)
  if (!harness.archiveSession) throw new Error('Chat archiving is not supported')
  await harness.interrupt(ws.id, sessionId)
  await harness.archiveSession(ws, sessionId)
  const update = await clearSelectedSession(ws.path, sessionId)
  if (update.changed)
    publishEvent({
      type: 'selected-session:updated',
      workspaceId: ws.id,
      sessionId: update.sessionId
    })
  broadcast(ws.id, { type: 'sessions_changed', sessionId })
}

export async function archiveViewSessions(ws: WorkspaceEntry, viewId: string) {
  const tabId = viewTabId(viewId)
  const records = await getSessionRecords(ws.path)
  for (const [sessionId, record] of Object.entries(records)) {
    if (record.tabId === tabId) await archiveWorkspaceSession(ws, sessionId)
  }
  await dropSessionTab(ws.path, tabId)
  publishEvent({ type: 'selected-session:updated', workspaceId: ws.id, sessionId: null })
}
