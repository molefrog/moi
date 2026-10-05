import { APP_ICON_IDS } from '@/lib/app-icons'
import { viewBuildDirectives } from '@/lib/view-build-directives'
import { viewIdFromTab, viewTabId } from '@/lib/workspace-tabs'
import type { PendingView, SelectedSessionScope, WorkspaceEntry, WorkspaceTabId } from '@/lib/types'
import { getCollabReferencePath } from './collab/config'
import { harnessFor } from './harness/registry'
import type { SendMessageInput } from './harness/types'
import { ForkUnsupportedError, inheritedHistoryBoundary } from './harness/fork'
import { publishEvent } from './events'
import { broadcast } from './state'
import { getPinnedSession, saveSelectedSession, resolveRenamedSession } from './selected-session'
import { getSessionRecord, patchSessionRecord } from './session-store'
import { getSessionConfig, saveSessionConfig } from './session-config'
import {
  beginViewBuild,
  createPendingView,
  getPendingView,
  listPendingViews,
  patchPendingView
} from './pending-views'

export class ViewStartupError extends Error {
  constructor(
    error: unknown,
    public sessionId?: string,
    public viewId?: string
  ) {
    super(error instanceof Error ? error.message : 'Couldn’t start view chat')
  }
}
type BuildSendOptions = Pick<
  SendMessageInput,
  'attachments' | 'optimisticId' | 'model' | 'effort' | 'fastMode' | 'stream'
> & { selectedSessionScope?: SelectedSessionScope }
export type SubmitViewInput = BuildSendOptions & { requirements: string; sessionId?: string }

// Both ordinary chat and initial build requests use this boundary.
export async function sendWorkspaceMessage(
  ws: WorkspaceEntry,
  input: SendMessageInput & { selectedSessionScope?: SelectedSessionScope }
) {
  const { selectedSessionScope, ...message } = input
  const sessionId = resolveRenamedSession(ws.path, input.sessionId)
  const record = await getSessionRecord(ws.path, sessionId)
  const tabId = input.context?.activeTab ?? 'overview'
  if (input.isNew && record.tabId !== tabId) {
    record.tabId = tabId === 'overview' ? undefined : tabId
    await attachSession(ws, tabId, sessionId, null, selectedSessionScope)
  }
  const viewId = viewIdFromTab(tabId)
  const pending = viewId ? await getPendingView(ws.path, viewId) : undefined
  if (pending)
    await patchPendingView(ws.id, ws.path, pending.id, {
      executionSessionId: sessionId
    })
  const collabReference = await getCollabReferencePath(ws.path, ws.type)
  await harnessFor(ws).sendMessage({
    ...message,
    sessionId,
    context: {
      ...input.context,
      activeTab: tabId,
      ...(collabReference ? { collabReference } : {}),
      directives: [
        ...(input.context?.directives ?? []),
        ...(pending ? viewBuildDirectives(pending.id, APP_ICON_IDS) : []),
        ...(pending && input.isNew && pending.requirements !== input.content
          ? [`Original view requirements:\n${pending.requirements}`]
          : []),
        ...(pending && input.attachments?.length
          ? ['Use the attachments as reference material for the intended view.']
          : []),
        `Current session id: ${sessionId}. Use this as --source-session for moi views create.`,
        ...(record.tabId
          ? [`This chat belongs to ${record.tabId}; the active tab may be different.`]
          : []),
        ...(record.forkedFromSessionId
          ? [
              'Inherited conversation is background. Work on the current request; do not resume unrelated earlier tasks.'
            ]
          : [])
      ]
    }
  })
  if (pending && pending.status !== 'starting')
    await patchPendingView(ws.id, ws.path, pending.id, { status: 'submitted', error: undefined })
}
async function attachSession(
  ws: WorkspaceEntry,
  tabId: WorkspaceTabId,
  sessionId: string,
  previousSessionId?: string | null,
  selectedSessionScope: SelectedSessionScope = 'shared'
) {
  await patchSessionRecord(ws.path, sessionId, { tabId: tabId === 'overview' ? undefined : tabId })
  broadcast(ws.id, { type: 'sessions_changed', sessionId })
  if (selectedSessionScope === 'shared') {
    await saveSelectedSession(ws.path, sessionId, previousSessionId, tabId)
    publishEvent({ type: 'selected-session:updated', workspaceId: ws.id, sessionId })
  }
}
async function sendBuild(
  ws: WorkspaceEntry,
  view: PendingView,
  sessionId: string,
  isNew: boolean,
  options: BuildSendOptions
) {
  await sendWorkspaceMessage(ws, {
    ...options,
    workspaceId: ws.id,
    workspacePath: ws.path,
    agentId: ws.agentId,
    sessionId,
    isNew,
    content: view.requirements,
    context: { activeTab: viewTabId(view.id) }
  })
  await patchPendingView(ws.id, ws.path, view.id, { status: 'submitted' }, 'starting')
}
async function failStartup(
  ws: WorkspaceEntry,
  error: unknown,
  sessionId?: string,
  view?: PendingView
): Promise<never> {
  if (view)
    await patchPendingView(
      ws.id,
      ws.path,
      view.id,
      {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Couldn’t start view chat'
      },
      'starting'
    )
  throw new ViewStartupError(
    error,
    sessionId ? resolveRenamedSession(ws.path, sessionId) : undefined,
    view?.id
  )
}

export async function submitView(ws: WorkspaceEntry, viewId: string, input: SubmitViewInput) {
  const pinned = await getPinnedSession(ws.path)
  const sessionId = pinned ?? input.sessionId ?? crypto.randomUUID()
  const view = await beginViewBuild(
    ws.id,
    ws.path,
    viewId,
    input.requirements,
    sessionId,
    !!input.attachments?.length
  )
  try {
    if (!pinned)
      await attachSession(ws, viewTabId(view.id), sessionId, undefined, input.selectedSessionScope)
    await sendBuild(ws, view, sessionId, !pinned, input)
  } catch (error) {
    return failStartup(ws, error, sessionId, view)
  }
  return { viewId, sessionId: resolveRenamedSession(ws.path, sessionId) }
}
export async function createViewFromSession(
  ws: WorkspaceEntry,
  sourceSessionId: string,
  requirements: string
) {
  if (!requirements.trim() || !sourceSessionId)
    throw new Error('Requirements and source session are required')
  sourceSessionId = resolveRenamedSession(ws.path, sourceSessionId)
  const harness = harnessFor(ws)
  if (
    !(await harness.listSessions(ws)).some(session => session.sessionId === sourceSessionId) &&
    !harness
      .activeSessions()
      .some(session => session.workspaceId === ws.id && session.sessionId === sourceSessionId)
  )
    throw new Error('Source chat not found')
  const pinned = await getPinnedSession(ws.path)
  if (pinned && pinned !== sourceSessionId)
    throw new Error('Unpin the workspace chat before creating a view from another chat')
  if (pinned) {
    const view = await createPendingView(ws.id, ws.path, {
      requirements: requirements.trim(),
      status: 'submitted',
      executionSessionId: pinned
    })
    return { viewId: view.id, mode: 'in-place' as const }
  }
  let sessionId: string | undefined
  let view: PendingView | undefined
  try {
    const sourceConfig = await getSessionConfig(ws.path, sourceSessionId)
    try {
      sessionId = await harness.forkSession?.(ws, sourceSessionId, sourceConfig)
    } catch (error) {
      if (!(error instanceof ForkUnsupportedError)) throw error
    }
    const isNew = !sessionId
    sessionId ??= crypto.randomUUID()
    if (!isNew) {
      await patchSessionRecord(ws.path, sessionId, { forkedFromSessionId: sourceSessionId })
      // The fork API returns only a child ID. A failed history read leaves the
      // child usable and its full transcript visible.
      const history = await harness.sessionEvents(ws, sessionId).catch(() => undefined)
      if (history)
        await patchSessionRecord(ws.path, sessionId, {
          forkedFromSessionId: sourceSessionId,
          ...inheritedHistoryBoundary(history)
        })
    }
    const config = await saveSessionConfig(ws.path, sessionId, sourceConfig)
    view = await createPendingView(ws.id, ws.path, {
      status: 'starting',
      requirements: requirements.trim(),
      executionSessionId: sessionId
    })
    await attachSession(ws, viewTabId(view.id), sessionId)
    await sendBuild(ws, view, sessionId, isNew, config)
    return {
      viewId: view.id,
      mode: 'handoff' as const,
      sessionId: resolveRenamedSession(ws.path, sessionId)
    }
  } catch (error) {
    return failStartup(ws, error, sessionId, view)
  }
}
export async function failInterruptedViewStarts(ws: WorkspaceEntry) {
  for (const view of await listPendingViews(ws.path)) {
    if (view.status === 'starting')
      await patchPendingView(
        ws.id,
        ws.path,
        view.id,
        {
          status: 'failed',
          error:
            'View chat startup was interrupted. Check the chat before continuing; it has not been retried.'
        },
        'starting'
      )
  }
}
