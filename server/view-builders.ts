import { mkdir, rename } from 'node:fs/promises'
import { join } from 'node:path'

import type { AppletKind, ViewBuilder, ViewInfo } from '@/lib/types'

import { DATA_DIR } from './data-dir'
import { publishEvent } from './events'
import { newBuilderId } from './short-id'

type ViewBuilderStore = Record<string, ViewBuilder[]>

// A build running past this is treated as hung/abandoned and reconciled back to
// `waiting`, even if its session still looks live. Generous so a slow but real
// build is never cut off mid-flight.
const STALE_BUILD_MS = 10 * 60_000

export class ViewBuilderError extends Error {
  status: 400 | 404 | 409

  constructor(message: string, status: 400 | 404 | 409) {
    super(message)
    this.name = 'ViewBuilderError'
    this.status = status
  }
}

let storePath = join(DATA_DIR, 'view-builders.json')
let writeChain: Promise<unknown> = Promise.resolve()

export function setViewBuilderStorePath(path: string): void {
  storePath = path
}

async function readStore(): Promise<ViewBuilderStore> {
  try {
    const parsed = JSON.parse(await Bun.file(storePath).text())
    return parsed && typeof parsed === 'object' ? (parsed as ViewBuilderStore) : {}
  } catch {
    return {}
  }
}

async function writeStore(store: ViewBuilderStore): Promise<void> {
  await mkdir(join(storePath, '..'), { recursive: true })
  const tmp = `${storePath}.${process.pid}.tmp`
  await Bun.write(tmp, JSON.stringify(store, null, 2))
  await rename(tmp, storePath)
}

function locked<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeChain.then(fn, fn)
  writeChain = run.catch(() => {})
  return run
}

async function mutateBuilders<T>(
  workspacePath: string,
  mutate: (builders: ViewBuilder[]) => T
): Promise<T> {
  return locked(async () => {
    const store = await readStore()
    const previous = store[workspacePath] ?? []
    const builders = [...previous]
    const result = mutate(builders)
    // Builder records are immutable inside mutations, so reference equality is
    // enough to detect a real add, replacement, or deletion.
    const changed =
      builders.length !== previous.length ||
      builders.some((builder, index) => builder !== previous[index])
    if (!changed) return result
    if (builders.length > 0) store[workspacePath] = builders
    else delete store[workspacePath]
    await writeStore(store)
    return result
  })
}

function updated(builder: ViewBuilder, patch: Partial<ViewBuilder>): ViewBuilder {
  return { ...builder, ...patch, updatedAt: Math.max(Date.now(), builder.updatedAt + 1) }
}

function replace(builders: ViewBuilder[], index: number, builder: ViewBuilder): ViewBuilder {
  builders[index] = builder
  return builder
}

function findBuilder(builders: ViewBuilder[], builderId: string): [ViewBuilder, number] {
  const index = builders.findIndex(builder => builder.id === builderId)
  if (index === -1) throw new ViewBuilderError('View builder not found', 404)
  return [builders[index], index]
}

function publishUpdated(workspaceId: string, builder: ViewBuilder): void {
  // Widget builders are record-only for now — no host UI consumes them, so keep
  // them off the client event stream (and out of the view-builder tab list).
  if (builder.kind === 'widget') return
  publishEvent({ type: 'view-builder:updated', workspaceId, builder })
}

export async function listViewBuilders(workspacePath: string): Promise<ViewBuilder[]> {
  return (await readStore())[workspacePath] ?? []
}

export async function createViewBuilder(
  workspaceId: string,
  workspacePath: string
): Promise<ViewBuilder> {
  const builder = await mutateBuilders(workspacePath, builders => {
    const now = Date.now()
    const created: ViewBuilder = {
      id: newBuilderId(),
      kind: 'view',
      status: 'draft',
      input: { requirements: '' },
      sessionId: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now
    }
    builders.push(created)
    return created
  })
  publishUpdated(workspaceId, builder)
  return builder
}

export async function updateViewBuilderInput(
  workspaceId: string,
  workspacePath: string,
  builderId: string,
  requirements: string
): Promise<ViewBuilder> {
  const builder = await mutateBuilders(workspacePath, builders => {
    const [current, index] = findBuilder(builders, builderId)
    if (current.status !== 'draft') {
      throw new ViewBuilderError('Submitted view builder input cannot be changed', 409)
    }
    return replace(builders, index, updated(current, { input: { requirements } }))
  })
  publishUpdated(workspaceId, builder)
  return builder
}

export async function beginViewBuilder(
  workspaceId: string,
  workspacePath: string,
  builderId: string,
  requirements: string
): Promise<ViewBuilder> {
  const text = requirements.trim()
  if (!text) throw new ViewBuilderError('View requirements are required', 400)
  const builder = await mutateBuilders(workspacePath, builders => {
    const [current, index] = findBuilder(builders, builderId)
    if (current.status !== 'draft') {
      throw new ViewBuilderError('View builder has already been submitted', 409)
    }
    const { error: _error, ...withoutError } = current
    return replace(
      builders,
      index,
      updated(withoutError as ViewBuilder, {
        status: 'building',
        buildingSince: Date.now(),
        input: { requirements: text }
      })
    )
  })
  publishUpdated(workspaceId, builder)
  return builder
}

type SetBuilderInput = {
  // Correlation handle for a pending, UI-initiated builder (the value injected
  // into the agent's prompt). Omitted for a standalone/widget build, which is
  // then keyed and upserted by its applet id.
  builderId?: string
  kind?: AppletKind
  // The states the agent reports first-hand. `ready` is never accepted here —
  // it stays server-derived from the compiled applet (bundle + reconcile).
  status?: 'building' | 'waiting'
  title?: string
  icon?: string
}

// Bind an applet id (+ optional title/icon/status) to a builder — the single
// write behind `moi builder set`. Locates the record by handle when claiming a
// pending builder, otherwise by applet id (creating one for a standalone build).
export async function setBuilder(
  workspaceId: string,
  workspacePath: string,
  appletId: string,
  input: SetBuilderInput
): Promise<ViewBuilder> {
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(appletId)) {
    throw new ViewBuilderError('Invalid applet id', 400)
  }
  if (input.icon !== undefined && !/^[a-z0-9][a-z0-9-]*$/.test(input.icon)) {
    throw new ViewBuilderError('Invalid view icon id', 400)
  }
  // Views and widgets are separate applet namespaces, so an id is only unique
  // within a kind — a view and a widget may both be called "stats".
  const kind: AppletKind = input.kind ?? 'view'
  const sameApplet = (candidate: ViewBuilder) =>
    candidate.viewId === appletId && (candidate.kind ?? 'view') === kind
  const builder = await mutateBuilders(workspacePath, builders => {
    const index = input.builderId
      ? builders.findIndex(candidate => candidate.id === input.builderId)
      : builders.findIndex(sameApplet)
    if (input.builderId && index === -1) {
      throw new ViewBuilderError('View builder not found', 404)
    }
    const clash = builders.find((candidate, i) => i !== index && sameApplet(candidate))
    if (clash) throw new ViewBuilderError(`View id "${appletId}" is already claimed`, 409)

    if (index === -1) {
      // Standalone build (e.g. a widget) with no pending record — create one.
      const now = Date.now()
      const status = input.status ?? 'building'
      const created: ViewBuilder = {
        id: newBuilderId(),
        kind,
        status,
        input: { requirements: '' },
        sessionId: crypto.randomUUID(),
        viewId: appletId,
        ...(input.title ? { title: input.title } : {}),
        ...(input.icon ? { icon: input.icon } : {}),
        ...(status === 'building' ? { buildingSince: now } : {}),
        createdAt: now,
        updatedAt: now
      }
      builders.push(created)
      return created
    }

    const current = builders[index]
    if (input.builderId && current.status === 'draft') {
      throw new ViewBuilderError('View builder has not been submitted', 409)
    }
    if (current.viewId && current.viewId !== appletId) {
      throw new ViewBuilderError(`View builder already claimed "${current.viewId}"`, 409)
    }
    // `ready` is terminal and server-owned: the agent's reported status can
    // never move a built applet back to building/waiting.
    const status = current.status === 'ready' ? 'ready' : (input.status ?? current.status)
    const enteringBuild = status === 'building' && current.status !== 'building'
    const { error: _error, ...withoutError } = current
    return replace(
      builders,
      index,
      updated(withoutError as ViewBuilder, {
        viewId: appletId,
        ...(input.kind ? { kind: input.kind } : {}),
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.icon !== undefined ? { icon: input.icon } : {}),
        status,
        ...(enteringBuild ? { buildingSince: Date.now() } : {})
      })
    )
  })
  publishUpdated(workspaceId, builder)
  return builder
}

export async function markViewBuilderBuildingBySession(
  workspaceId: string,
  workspacePath: string,
  sessionId: string
): Promise<ViewBuilder | null> {
  const builder = await mutateBuilders(workspacePath, builders => {
    const index = builders.findIndex(candidate => candidate.sessionId === sessionId)
    if (index === -1 || builders[index].status !== 'waiting') return null
    const { error: _error, ...withoutError } = builders[index]
    return replace(
      builders,
      index,
      updated(withoutError as ViewBuilder, { status: 'building', buildingSince: Date.now() })
    )
  })
  if (builder) publishUpdated(workspaceId, builder)
  return builder
}

export async function markViewBuilderWaitingBySession(
  workspaceId: string,
  workspacePath: string,
  sessionId: string,
  error?: string
): Promise<ViewBuilder | null> {
  const builder = await mutateBuilders(workspacePath, builders => {
    const index = builders.findIndex(candidate => candidate.sessionId === sessionId)
    if (index === -1) return null
    const current = builders[index]
    if (current.status === 'waiting' && error && current.error !== error) {
      return replace(builders, index, updated(current, { error }))
    }
    if (current.status !== 'building') return null
    return replace(
      builders,
      index,
      updated(current, { status: 'waiting', ...(error ? { error } : {}) })
    )
  })
  if (builder) publishUpdated(workspaceId, builder)
  return builder
}

export async function markViewBuilderWaiting(
  workspaceId: string,
  workspacePath: string,
  builderId: string,
  error?: string
): Promise<ViewBuilder | null> {
  const builder = await mutateBuilders(workspacePath, builders => {
    const [current, index] = findBuilder(builders, builderId)
    if (current.status === 'ready' || (current.status === 'waiting' && current.error === error)) {
      return null
    }
    return replace(
      builders,
      index,
      updated(current, { status: 'waiting', ...(error ? { error } : {}) })
    )
  })
  if (builder) publishUpdated(workspaceId, builder)
  return builder
}

export async function renameViewBuilderSession(
  workspaceId: string,
  workspacePath: string,
  from: string,
  to: string
): Promise<ViewBuilder | null> {
  if (from === to) return null
  const builder = await mutateBuilders(workspacePath, builders => {
    const index = builders.findIndex(candidate => candidate.sessionId === from)
    if (index === -1) return null
    return replace(builders, index, updated(builders[index], { sessionId: to }))
  })
  if (builder) publishUpdated(workspaceId, builder)
  return builder
}

export async function markViewBuilderReady(
  workspaceId: string,
  workspacePath: string,
  viewId: string,
  title: string,
  icon?: string
): Promise<ViewBuilder | null> {
  const builder = await mutateBuilders(workspacePath, builders => {
    const index = builders.findIndex(candidate => candidate.viewId === viewId)
    if (index === -1 || builders[index].status === 'ready') return null
    const { error: _error, ...withoutError } = builders[index]
    return replace(
      builders,
      index,
      updated(withoutError as ViewBuilder, {
        status: 'ready',
        title,
        ...(icon ? { icon } : {})
      })
    )
  })
  if (builder) publishUpdated(workspaceId, builder)
  return builder
}

export async function reconcileViewBuilders(
  workspaceId: string,
  workspacePath: string,
  views: ViewInfo[],
  activeSessionIds: Set<string>
): Promise<ViewBuilder[]> {
  const now = Date.now()
  const changed = await mutateBuilders(workspacePath, builders => {
    const viewsById = new Map(views.map(view => [view.id, view]))
    const updates: ViewBuilder[] = []
    for (let index = 0; index < builders.length; index++) {
      const current = builders[index]
      // Only view builders reconcile against the compiled view list; widget
      // records track their own applet id in a separate namespace.
      const view =
        current.viewId && current.kind !== 'widget' ? viewsById.get(current.viewId) : undefined
      // A build with no live session (server restart, drained turn) — or one that
      // has been building far too long (a hung/abandoned turn that never drained)
      // — is stuck; hand it back so the user can resume or discard it.
      const stuck =
        current.status === 'building' &&
        (!activeSessionIds.has(current.sessionId) ||
          (current.buildingSince !== undefined && now - current.buildingSince > STALE_BUILD_MS))
      if (view && current.status !== 'ready') {
        const { error: _error, ...withoutError } = current
        const next = updated(withoutError as ViewBuilder, {
          status: 'ready',
          title: view.config.title,
          ...(view.config.icon ? { icon: view.config.icon } : {})
        })
        builders[index] = next
        updates.push(next)
      } else if (stuck) {
        const next = updated(current, { status: 'waiting' })
        builders[index] = next
        updates.push(next)
      }
    }
    return updates
  })
  for (const builder of changed) publishUpdated(workspaceId, builder)
  return listViewBuilders(workspacePath)
}

export async function deleteViewBuilder(
  workspaceId: string,
  workspacePath: string,
  builderId: string
): Promise<void> {
  await mutateBuilders(workspacePath, builders => {
    const [builder, index] = findBuilder(builders, builderId)
    if (builder.status === 'building') {
      throw new ViewBuilderError('A building view can only be closed', 409)
    }
    if (builder.status === 'ready') {
      throw new ViewBuilderError('Ready view builder history is retained', 409)
    }
    builders.splice(index, 1)
  })
  publishEvent({ type: 'view-builder:deleted', workspaceId, builderId })
}
