import { isAppIconId } from '@/lib/app-icons'
import { newViewId } from '@/lib/ids'
import type { PendingView, WorkspaceEntry } from '@/lib/types'
import { publishEvent } from '../events'
import {
  readWorkspaceState,
  updateWorkspaceState,
  type PendingViewState,
  type WorkspaceRef,
  type WorkspaceState
} from '../workspace-state'
import { archiveViewSessions } from './archive'

export class PendingViewError extends Error {
  constructor(
    message: string,
    public status: 400 | 404 | 409 = 400
  ) {
    super(message)
  }
}

type PendingViewPatch = Partial<
  Pick<PendingView, 'status' | 'requirements' | 'executionSessionId' | 'error'>
>

// The API calls the build chat `executionSessionId`; the state file calls it
// `buildSessionId`.
function toPendingView(id: string, view: PendingViewState): PendingView {
  const { buildSessionId, ...rest } = view
  return { id, ...rest, ...(buildSessionId ? { executionSessionId: buildSessionId } : {}) }
}

function applyPatch(view: PendingViewState, patch: PendingViewPatch): void {
  const { executionSessionId, ...rest } = patch
  Object.assign(view, rest)
  if ('executionSessionId' in patch) view.buildSessionId = executionSessionId
  for (const key of Object.keys(view) as (keyof PendingViewState)[])
    if (view[key] === undefined) delete view[key]
}

export function viewsChanged(workspaceId: string): void {
  publishEvent({ type: 'views:changed', workspaceId })
}

export async function listPendingViews(ws: WorkspaceRef): Promise<PendingView[]> {
  const { pendingViews } = await readWorkspaceState(ws)
  return Object.entries(pendingViews).map(([id, view]) => toPendingView(id, view))
}

export async function getPendingView(ws: WorkspaceRef, id: string) {
  const view = (await readWorkspaceState(ws)).pendingViews[id]
  return view ? toPendingView(id, view) : undefined
}

export async function createPendingView(ws: WorkspaceRef, input: PendingViewPatch = {}) {
  const id = newViewId()
  const view = await updateWorkspaceState(ws, state => {
    const created: PendingViewState = { status: 'draft', requirements: '' }
    applyPatch(created, input)
    state.pendingViews[id] = created
    return toPendingView(id, created)
  })
  viewsChanged(ws.id)
  return view
}

export async function patchPendingView(
  ws: WorkspaceRef,
  id: string,
  patch: PendingViewPatch,
  expectedStatus?: PendingView['status']
) {
  const view = await updateWorkspaceState(ws, state => {
    const view = state.pendingViews[id]
    // A bundle can complete while a send is being accepted.
    if (!view) return undefined
    if (!expectedStatus || view.status === expectedStatus) applyPatch(view, patch)
    return toPendingView(id, view)
  })
  viewsChanged(ws.id)
  return view
}

// Move a draft to `starting` inside a state transaction.
export function startViewBuild(
  state: WorkspaceState,
  id: string,
  requirements: string,
  sessionId: string,
  hasAttachments: boolean
): PendingView {
  if (!requirements.trim() && !hasAttachments)
    throw new PendingViewError('View requirements or an attachment are required')
  const view = state.pendingViews[id]
  if (!view) throw new PendingViewError('Pending view not found', 404)
  if (view.status !== 'draft') throw new PendingViewError('View has already been submitted', 409)
  view.status = 'starting'
  view.requirements = requirements.trim()
  view.buildSessionId = sessionId
  return toPendingView(id, view)
}

export async function updatePendingView(
  ws: WorkspaceRef,
  id: string,
  input: { requirements?: string; title?: string; icon?: string }
) {
  if (input.icon !== undefined && !isAppIconId(input.icon))
    throw new PendingViewError(`Unknown view icon id "${input.icon}"`)
  const view = await updateWorkspaceState(ws, state => {
    const view = state.pendingViews[id]
    if (!view) throw new PendingViewError('Pending view not found', 404)
    if (input.requirements !== undefined) {
      if (view.status !== 'draft')
        throw new PendingViewError('Submitted view input cannot be changed', 409)
      view.requirements = input.requirements
    }
    if (input.title !== undefined) view.title = input.title
    if (input.icon !== undefined) view.icon = input.icon
    return toPendingView(id, view)
  })
  viewsChanged(ws.id)
  return view
}

export async function completeViewBuild(ws: WorkspaceRef, id: string) {
  const removed = await updateWorkspaceState(ws, state => {
    if (!state.pendingViews[id]) return false
    delete state.pendingViews[id]
    return true
  })
  if (removed) viewsChanged(ws.id)
}

// Follow a temporary id's rename in every build that runs in it.
export function renameBuildSession(state: WorkspaceState, from: string, to: string): boolean {
  let changed = false
  for (const view of Object.values(state.pendingViews)) {
    if (view.buildSessionId !== from) continue
    view.buildSessionId = to
    changed = true
  }
  return changed
}

export async function discardPendingView(
  ws: WorkspaceEntry,
  id: string,
  activeSessionIds: Set<string>
) {
  const view = (await readWorkspaceState(ws)).pendingViews[id]
  if (!view) throw new PendingViewError('Pending view not found', 404)
  if (
    view.status === 'starting' ||
    (view.buildSessionId && activeSessionIds.has(view.buildSessionId))
  )
    throw new PendingViewError('A starting or building view can only be closed', 409)
  // Archiving talks to the harness, so it runs before the state transaction.
  await archiveViewSessions(ws, id)
  await updateWorkspaceState(ws, state => {
    delete state.pendingViews[id]
  })
  viewsChanged(ws.id)
}
