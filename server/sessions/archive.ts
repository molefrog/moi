import type { WorkspaceEntry } from '@/lib/types'
import { viewTabId } from '@/lib/workspace-tabs'
import { harnessFor } from '../harness/registry'
import { clearSelectedSession, dropSessionTab } from './selected'
import { getSessionEntries } from './store'
import { broadcast } from '../state'

export async function archiveWorkspaceSession(ws: WorkspaceEntry, sessionId: string) {
  const harness = harnessFor(ws)
  if (!harness.archiveSession) throw new Error('Chat archiving is not supported')
  await harness.interrupt(ws.id, sessionId)
  await harness.archiveSession(ws, sessionId)
  await clearSelectedSession(ws, sessionId)
  broadcast(ws.id, { type: 'session_archived', sessionId })
}

export async function archiveViewSessions(ws: WorkspaceEntry, viewId: string) {
  const tabId = viewTabId(viewId)
  for (const [sessionId, session] of Object.entries(await getSessionEntries(ws))) {
    if (session.tabId === tabId) await archiveWorkspaceSession(ws, sessionId)
  }
  await dropSessionTab(ws, tabId)
}
