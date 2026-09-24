import { mkdir, rename } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { isAppIconId } from '@/lib/app-icons'
import { newViewId } from '@/lib/ids'
import type { PendingView } from '@/lib/types'
import { viewTabId } from '@/lib/workspace-tabs'
import { DATA_DIR } from './data-dir'
import { publishEvent } from './events'
import { clearSessionRecordTab } from './session-store'
import { dropSessionTab } from './selected-session'

type Store = Record<string, PendingView[]>
let storePath = join(DATA_DIR, 'pending-views.json')
let writes: Promise<unknown> = Promise.resolve()

export class PendingViewError extends Error {
  constructor(
    message: string,
    public status: 400 | 404 | 409 = 400
  ) {
    super(message)
  }
}
export function setPendingViewStorePath(path: string) {
  storePath = path
}
async function read(): Promise<Store> {
  const file = Bun.file(storePath)
  return (await file.exists()) ? file.json() : {}
}
export async function listPendingViews(path: string): Promise<PendingView[]> {
  await writes
  return (await read())[path] ?? []
}
export async function getPendingView(path: string, id: string) {
  return (await listPendingViews(path)).find(view => view.id === id)
}
function changed(workspaceId: string) {
  publishEvent({ type: 'views:changed', workspaceId })
}
async function update<T>(workspaceId: string, path: string, mutate: (views: PendingView[]) => T) {
  const run = writes.then(async () => {
    const store = await read()
    const views = (store[path] ??= [])
    const result = mutate(views)
    if (!views.length) delete store[path]
    await mkdir(dirname(storePath), { recursive: true })
    const temp = `${storePath}.${process.pid}.tmp`
    await Bun.write(temp, JSON.stringify(store, null, 2))
    await rename(temp, storePath)
    changed(workspaceId)
    return result
  })
  writes = run.catch(() => {})
  return run
}
export async function createPendingView(
  workspaceId: string,
  path: string,
  input: Partial<Pick<PendingView, 'status' | 'requirements' | 'executionSessionId' | 'error'>> = {}
) {
  return update(workspaceId, path, views => {
    const view: PendingView = {
      id: newViewId(),
      status: 'draft',
      requirements: '',
      ...input
    }
    views.push(view)
    return view
  })
}
export async function patchPendingView(
  workspaceId: string,
  path: string,
  id: string,
  patch: Partial<Pick<PendingView, 'status' | 'requirements' | 'executionSessionId' | 'error'>>,
  expectedStatus?: PendingView['status']
) {
  return update(workspaceId, path, views => {
    const view = views.find(view => view.id === id)
    // A bundle can complete while a send is being accepted.
    if (!view || (expectedStatus && view.status !== expectedStatus)) return view
    Object.assign(view, patch)
    return view
  })
}
export async function beginViewBuild(
  workspaceId: string,
  path: string,
  id: string,
  requirements: string,
  sessionId: string,
  hasAttachments: boolean
) {
  if (!requirements.trim() && !hasAttachments)
    throw new PendingViewError('View requirements or an attachment are required')
  return update(workspaceId, path, views => {
    const view = views.find(view => view.id === id)
    if (!view) throw new PendingViewError('Pending view not found', 404)
    if (view.status !== 'draft') throw new PendingViewError('View has already been submitted', 409)
    view.status = 'starting'
    view.requirements = requirements.trim()
    view.executionSessionId = sessionId
    return view
  })
}
export async function updatePendingView(
  workspaceId: string,
  path: string,
  id: string,
  input: { requirements?: string; title?: string; icon?: string }
) {
  if (input.icon !== undefined && !isAppIconId(input.icon))
    throw new PendingViewError(`Unknown view icon id "${input.icon}"`)
  return update(workspaceId, path, views => {
    const view = views.find(view => view.id === id)
    if (!view) throw new PendingViewError('Pending view not found', 404)
    if (input.requirements !== undefined) {
      if (view.status !== 'draft')
        throw new PendingViewError('Submitted view input cannot be changed', 409)
      view.requirements = input.requirements
    }
    if (input.title !== undefined) view.title = input.title
    if (input.icon !== undefined) view.icon = input.icon
    return view
  })
}
export async function completeViewBuild(workspaceId: string, path: string, id: string) {
  if (!(await getPendingView(path, id))) return
  await update(workspaceId, path, views => {
    const index = views.findIndex(view => view.id === id)
    if (index !== -1) views.splice(index, 1)
  })
}
export async function renameViewExecutionSession(
  workspaceId: string,
  path: string,
  from: string,
  to: string
) {
  if (!(await listPendingViews(path)).some(view => view.executionSessionId === from)) return
  await update(workspaceId, path, views => {
    for (const view of views) {
      if (view.executionSessionId === from) view.executionSessionId = to
    }
  })
}
export async function clearViewSessions(workspaceId: string, path: string, id: string) {
  await clearSessionRecordTab(path, viewTabId(id))
  await dropSessionTab(path, viewTabId(id))
  publishEvent({ type: 'selected-session:updated', workspaceId, sessionId: null })
}
export async function discardPendingView(
  workspaceId: string,
  path: string,
  id: string,
  activeSessionIds: Set<string>
) {
  await update(workspaceId, path, views => {
    const index = views.findIndex(view => view.id === id)
    if (index === -1) throw new PendingViewError('Pending view not found', 404)
    const view = views[index]
    if (
      view.status === 'starting' ||
      (view.executionSessionId && activeSessionIds.has(view.executionSessionId))
    )
      throw new PendingViewError('A starting or building view can only be closed', 409)
    views.splice(index, 1)
  })
  await clearViewSessions(workspaceId, path, id)
}
