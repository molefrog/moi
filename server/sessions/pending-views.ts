import { isAppIconId } from '@/lib/app-icons'
import { newViewId } from '@/lib/ids'
import type { PendingView, WorkspaceEntry, WorkspaceState } from '@/lib/types'
import { readWorkspaceState, updateWorkspaceState, type WorkspaceRef } from '../workspace-state'
import { archiveViewSessions } from './archive'

export class PendingViewError extends Error {
  constructor(
    message: string,
    public status: 400 | 404 | 409 = 400
  ) {
    super(message)
  }
}

type PendingViewState = Omit<PendingView, 'id'>
type PendingViewPatch = Partial<
  Pick<PendingView, 'status' | 'requirements' | 'buildSessionId' | 'error'>
>

function applyPatch(view: PendingViewState, patch: PendingViewPatch): void {
  Object.assign(view, patch)
  for (const key of Object.keys(view) as (keyof PendingViewState)[])
    if (view[key] === undefined) delete view[key]
}

export async function listPendingViews(ws: WorkspaceRef): Promise<PendingView[]> {
  const { pendingViews } = await readWorkspaceState(ws)
  return Object.entries(pendingViews).map(([id, view]) => ({ id, ...view }))
}

export async function getPendingView(ws: WorkspaceRef, id: string) {
  const view = (await readWorkspaceState(ws)).pendingViews[id]
  return view ? { id, ...view } : undefined
}

export async function createPendingView(
  ws: WorkspaceRef,
  input: PendingViewPatch = {}
): Promise<PendingView> {
  const id = newViewId()
  return updateWorkspaceState(ws, state => {
    const created: PendingViewState = { status: 'draft', requirements: '' }
    applyPatch(created, input)
    state.pendingViews[id] = created
    return { id, ...created }
  })
}

export async function patchPendingView(
  ws: WorkspaceRef,
  id: string,
  patch: PendingViewPatch,
  expectedStatus?: PendingView['status']
) {
  return updateWorkspaceState(ws, state => {
    const view = state.pendingViews[id]
    // A bundle can complete while a send is being accepted.
    if (!view) return undefined
    if (!expectedStatus || view.status === expectedStatus) applyPatch(view, patch)
    return { id, ...view }
  })
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
  return { id, ...view }
}

export async function updatePendingView(
  ws: WorkspaceRef,
  id: string,
  input: { requirements?: string; title?: string; icon?: string }
) {
  if (input.icon !== undefined && !isAppIconId(input.icon))
    throw new PendingViewError(`Unknown view icon id "${input.icon}"`)
  return updateWorkspaceState(ws, state => {
    const view = state.pendingViews[id]
    if (!view) throw new PendingViewError('Pending view not found', 404)
    if (input.requirements !== undefined) {
      if (view.status !== 'draft')
        throw new PendingViewError('Submitted view input cannot be changed', 409)
      view.requirements = input.requirements
    }
    if (input.title !== undefined) view.title = input.title
    if (input.icon !== undefined) view.icon = input.icon
    return { id, ...view }
  })
}

export async function completeViewBuild(ws: WorkspaceRef, id: string) {
  await updateWorkspaceState(ws, state => {
    delete state.pendingViews[id]
  })
}

// Follow a temporary id's rename in every build that runs in it.
export function renameBuildSession(state: WorkspaceState, from: string, to: string): void {
  for (const view of Object.values(state.pendingViews)) {
    if (view.buildSessionId === from) view.buildSessionId = to
  }
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
}
