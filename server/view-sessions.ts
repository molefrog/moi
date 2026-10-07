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
  patchPendingView,
  PendingViewError
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
  input: SendMessageInput & { selectedSessionScope?: SelectedSessionScope; viewBuildId?: string }
) {
  const { selectedSessionScope, viewBuildId, ...message } = input
  const sessionId = resolveRenamedSession(ws.path, input.sessionId)
  const record = await getSessionRecord(ws.path, sessionId)
  const tabId = input.context?.activeTab?.id ?? record.tabId ?? 'overview'
  const targetViewId = viewBuildId ?? (input.isNew ? viewIdFromTab(tabId) : undefined)
  const ownedViews = targetViewId
    ? []
    : (await listPendingViews(ws.path)).filter(view => view.executionSessionId === sessionId)
  const pending = targetViewId
    ? await getPendingView(ws.path, targetViewId)
    : (ownedViews.find(view => view.id === viewIdFromTab(tabId)) ?? ownedViews[0])
  const isBuildRequest = pending && (viewBuildId === pending.id || input.isNew)
  if (
    isBuildRequest &&
    pending.executionSessionId &&
    pending.executionSessionId !== sessionId &&
    (pending.status === 'starting' ||
      harnessFor(ws)
        .activeSessions()
        .some(
          session =>
            session.workspaceId === ws.id && session.sessionId === pending.executionSessionId
        ))
  )
    throw new PendingViewError('This view is already being built in another chat', 409)
  if (input.isNew && record.tabId !== tabId) {
    record.tabId = tabId === 'overview' ? undefined : tabId
    await attachSession(ws, tabId, sessionId, null, selectedSessionScope)
  }
  if (isBuildRequest)
    await patchPendingView(ws.id, ws.path, pending.id, {
      executionSessionId: sessionId
    })
  const collabReference = await getCollabReferencePath(ws.path, ws.type)
  const pinnedSessionId = await getPinnedSession(ws.path)
  await harnessFor(ws).sendMessage({
    ...message,
    sessionId,
    context: {
      ...input.context,
      session: {
        id: sessionId,
        tabId: record.tabId,
        pinned: pinnedSessionId === sessionId
      },
      ...(collabReference ? { collabReference } : {}),
      directives: [
        ...(input.context?.directives ?? []),
        ...(isBuildRequest ? viewBuildDirectives(pending.id, APP_ICON_IDS) : []),
        ...(isBuildRequest && record.forkedFromSessionId
          ? [
              'Inherited conversation is background. Work on the current request; do not resume unrelated earlier tasks.'
            ]
          : []),
        ...(pending && input.isNew && pending.requirements !== input.content
          ? [`Original view requirements:\n${pending.requirements}`]
          : []),
        ...(pending && input.attachments?.length
          ? ['Use the attachments as reference material for the intended view.']
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
    viewBuildId: view.id,
    content: view.requirements
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
  fromSessionId: string | undefined,
  requirements: string
) {
  if (!requirements.trim()) throw new Error('View requirements are required')
  if (fromSessionId === undefined) {
    const view = await createPendingView(ws.id, ws.path, {
      requirements: requirements.trim(),
      status: 'submitted'
    })
    return {
      viewId: view.id,
      mode: 'in-place' as const,
      buildInstructions: viewBuildDirectives(view.id, APP_ICON_IDS)
    }
  }
  if (!fromSessionId) throw new Error('Session id cannot be empty')
  fromSessionId = resolveRenamedSession(ws.path, fromSessionId)
  const harness = harnessFor(ws)
  if (
    !(await harness.listSessions(ws)).some(session => session.sessionId === fromSessionId) &&
    !harness
      .activeSessions()
      .some(session => session.workspaceId === ws.id && session.sessionId === fromSessionId)
  )
    throw new Error('Source chat not found')
  let sessionId: string | undefined
  let view: PendingView | undefined
  try {
    const sourceConfig = await getSessionConfig(ws.path, fromSessionId)
    try {
      sessionId = await harness.forkSession?.(ws, fromSessionId, sourceConfig)
    } catch (error) {
      if (!(error instanceof ForkUnsupportedError)) throw error
    }
    const isNew = !sessionId
    sessionId ??= crypto.randomUUID()
    if (!isNew) {
      await patchSessionRecord(ws.path, sessionId, { forkedFromSessionId: fromSessionId })
      // The fork API returns only a child ID. A failed history read leaves the
      // child usable and its full transcript visible.
      const history = await harness.sessionEvents(ws, sessionId).catch(() => undefined)
      if (history)
        await patchSessionRecord(ws.path, sessionId, {
          forkedFromSessionId: fromSessionId,
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
