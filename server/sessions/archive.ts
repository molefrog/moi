import type { WorkspaceEntry } from '@/lib/types'
import { viewTabId } from '@/lib/workspace-tabs'
import { publishEvent } from '../events'
import { harnessFor } from '../harness/registry'
import { clearSelectedSession, dropSessionTab } from './selected'
import { getSessionRecords } from './store'
import { broadcast } from '../state'

export async function archiveWorkspaceSession(ws: WorkspaceEntry, sessionId: string) {
  const harness = harnessFor(ws)
  if (!harness.archiveSession) throw new Error('Chat archiving is not supported')
  await harness.interrupt(ws.id, sessionId)
  await harness.archiveSession(ws, sessionId)
  const update = await clearSelectedSession(ws, sessionId)
  if (update.changed)
    publishEvent({
      type: 'selected-session:updated',
      workspaceId: ws.id,
      sessionId: update.sessionId
    })
  broadcast(ws.id, { type: 'session_archived', sessionId })
}

export async function archiveViewSessions(ws: WorkspaceEntry, viewId: string) {
  const tabId = viewTabId(viewId)
  const records = await getSessionRecords(ws)
  for (const [sessionId, record] of Object.entries(records)) {
    if (record.tabId === tabId) await archiveWorkspaceSession(ws, sessionId)
  }
  await dropSessionTab(ws, tabId)
  publishEvent({ type: 'selected-session:updated', workspaceId: ws.id, sessionId: null })
}
