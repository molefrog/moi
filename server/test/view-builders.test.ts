import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { ViewBuilder } from '@/lib/types'

import {
  ViewBuilderError,
  beginViewBuilder,
  createViewBuilder,
  deleteViewBuilder,
  listViewBuilders,
  markViewBuilderBuildingBySession,
  markViewBuilderWaitingBySession,
  reconcileViewBuilders,
  renameViewBuilderSession,
  setBuilder,
  setViewBuilderStorePath,
  updateViewBuilderInput
} from '../view-builders'

const workspaceId = 'workspace-1'
const workspacePath = '/tmp/view-builder-workspace'
let storeDir = ''
let storePath = ''

beforeAll(async () => {
  storeDir = await mkdtemp(join(tmpdir(), 'moi-view-builders-'))
  storePath = join(storeDir, 'view-builders.json')
  setViewBuilderStorePath(storePath)
})

afterAll(async () => {
  await rm(storeDir, { recursive: true, force: true })
})

// Backdate a builder's buildingSince directly in the store to simulate a build
// that has been running longer than the stale threshold (no fake clock needed).
async function mutateBuildingSince(builderId: string, value: number): Promise<boolean> {
  const store = JSON.parse(await Bun.file(storePath).text()) as Record<string, ViewBuilder[]>
  let found = false
  for (const builders of Object.values(store)) {
    for (const builder of builders) {
      if (builder.id === builderId) {
        builder.buildingSince = value
        found = true
      }
    }
  }
  await Bun.write(storePath, JSON.stringify(store, null, 2))
  return found
}

describe('view builder storage', () => {
  test('serializes concurrent creates without losing builders', async () => {
    const created = await Promise.all(
      Array.from({ length: 8 }, () => createViewBuilder(workspaceId, workspacePath))
    )
    const stored = await listViewBuilders(workspacePath)
    expect(stored).toHaveLength(8)
    expect(new Set(created.map(builder => builder.id)).size).toBe(8)
    expect(new Set(created.map(builder => builder.sessionId)).size).toBe(8)
  })

  test('does not rewrite storage for a missing session', async () => {
    const before = await stat(storePath, { bigint: true })
    expect(
      await markViewBuilderBuildingBySession(workspaceId, workspacePath, 'missing-session')
    ).toBeNull()
    const after = await stat(storePath, { bigint: true })
    expect(after.ino).toBe(before.ino)
  })

  test('freezes submitted input and rejects a duplicate submit', async () => {
    const draft = (await listViewBuilders(workspacePath))[0]
    await updateViewBuilderInput(workspaceId, workspacePath, draft.id, 'A sales dashboard')
    const building = await beginViewBuilder(
      workspaceId,
      workspacePath,
      draft.id,
      'Latest sales dashboard requirements'
    )
    expect(building.status).toBe('building')
    expect(building.input.requirements).toBe('Latest sales dashboard requirements')

    await expect(
      beginViewBuilder(workspaceId, workspacePath, draft.id, 'Submit again')
    ).rejects.toBeInstanceOf(ViewBuilderError)
    await expect(
      updateViewBuilderInput(workspaceId, workspacePath, draft.id, 'Change after submit')
    ).rejects.toBeInstanceOf(ViewBuilderError)
  })

  test('locks claimed ids, allows title updates, and rejects duplicate ids', async () => {
    const builders = await listViewBuilders(workspacePath)
    const first = builders[0]
    const second = builders[1]
    await beginViewBuilder(workspaceId, workspacePath, second.id, 'Another view')

    const claimed = await setBuilder(workspaceId, workspacePath, 'sales-dashboard', {
      builderId: first.id,
      title: 'Sales dashboard',
      icon: 'chart'
    })
    expect(claimed.viewId).toBe('sales-dashboard')
    expect(claimed.icon).toBe('chart')

    const renamed = await setBuilder(workspaceId, workspacePath, 'sales-dashboard', {
      builderId: first.id,
      title: 'Revenue dashboard',
      icon: 'target'
    })
    expect(renamed.title).toBe('Revenue dashboard')
    expect(renamed.icon).toBe('target')
    // A claimed builder can't be re-pointed at a different id.
    await expect(
      setBuilder(workspaceId, workspacePath, 'different-id', {
        builderId: first.id,
        title: 'Different',
        icon: 'file'
      })
    ).rejects.toBeInstanceOf(ViewBuilderError)
    // Another builder can't claim an id already taken.
    await expect(
      setBuilder(workspaceId, workspacePath, 'sales-dashboard', {
        builderId: second.id,
        title: 'Duplicate',
        icon: 'file'
      })
    ).rejects.toBeInstanceOf(ViewBuilderError)
    // Invalid icon id is rejected.
    await expect(
      setBuilder(workspaceId, workspacePath, 'another-view', {
        builderId: second.id,
        title: 'Another view',
        icon: 'ChartBar'
      })
    ).rejects.toBeInstanceOf(ViewBuilderError)
  })

  test('creates a standalone widget builder keyed by applet id and stamps buildingSince', async () => {
    const created = await setBuilder(workspaceId, workspacePath, 'sales-widget', {
      kind: 'widget',
      status: 'building',
      title: 'Sales widget'
    })
    expect(created.kind).toBe('widget')
    expect(created.viewId).toBe('sales-widget')
    expect(created.status).toBe('building')
    expect(created.buildingSince).toBeGreaterThan(0)

    // A second call with the same id upserts the existing record, not a new one.
    const updated = await setBuilder(workspaceId, workspacePath, 'sales-widget', {
      kind: 'widget',
      title: 'Revenue widget'
    })
    expect(updated.id).toBe(created.id)
    expect(updated.title).toBe('Revenue widget')

    const stored = await listViewBuilders(workspacePath)
    expect(stored.filter(builder => builder.viewId === 'sales-widget')).toHaveLength(1)

    // Hand it back so it can be discarded (a building builder can't be), and
    // clear it from the shared store before the later reconcile tests run.
    const parked = await setBuilder(workspaceId, workspacePath, 'sales-widget', {
      kind: 'widget',
      status: 'waiting'
    })
    expect(parked.status).toBe('waiting')
    await deleteViewBuilder(workspaceId, workspacePath, created.id)
  })

  test('a view and a widget may share an applet id without clashing', async () => {
    const view = await setBuilder(workspaceId, workspacePath, 'shared-id', {
      kind: 'view',
      title: 'Shared view',
      icon: 'chart'
    })
    const widget = await setBuilder(workspaceId, workspacePath, 'shared-id', {
      kind: 'widget',
      title: 'Shared widget'
    })
    expect(view.id).not.toBe(widget.id)
    expect(view.kind).toBe('view')
    expect(widget.kind).toBe('widget')

    // Setting the widget again resolves to the widget record, not the view.
    const again = await setBuilder(workspaceId, workspacePath, 'shared-id', {
      kind: 'widget',
      title: 'Shared widget v2'
    })
    expect(again.id).toBe(widget.id)
    expect(again.title).toBe('Shared widget v2')

    for (const id of [view.id, widget.id]) {
      await setBuilder(workspaceId, workspacePath, 'shared-id', {
        kind: id === view.id ? 'view' : 'widget',
        status: 'waiting'
      })
      await deleteViewBuilder(workspaceId, workspacePath, id)
    }
  })

  test('a stale buildingSince demotes a build even with a live session', async () => {
    const draft = (await listViewBuilders(workspacePath)).find(
      builder => builder.status === 'draft'
    )
    if (!draft) throw new Error('expected a draft builder')
    await beginViewBuilder(workspaceId, workspacePath, draft.id, 'Hung build')
    const building = (await listViewBuilders(workspacePath)).find(
      builder => builder.id === draft.id
    )
    expect(building?.status).toBe('building')

    // Session is "live", but the build has been running far too long.
    const stale = await mutateBuildingSince(draft.id, Date.now() - 20 * 60_000)
    expect(stale).toBe(true)
    const reconciled = await reconcileViewBuilders(
      workspaceId,
      workspacePath,
      [],
      new Set([draft.sessionId])
    )
    expect(reconciled.find(builder => builder.id === draft.id)?.status).toBe('waiting')
  })

  test('follows session renames and moves between waiting and building', async () => {
    const builder = (await listViewBuilders(workspacePath))[0]
    const renamed = await renameViewBuilderSession(
      workspaceId,
      workspacePath,
      builder.sessionId,
      'real-session-id'
    )
    expect(renamed?.sessionId).toBe('real-session-id')

    const waiting = await markViewBuilderWaitingBySession(
      workspaceId,
      workspacePath,
      'real-session-id',
      'Agent stopped'
    )
    expect(waiting?.status).toBe('waiting')
    expect(waiting?.error).toBe('Agent stopped')

    const retrying = await markViewBuilderBuildingBySession(
      workspaceId,
      workspacePath,
      'real-session-id'
    )
    expect(retrying?.status).toBe('building')
    expect(retrying?.error).toBeUndefined()
  })

  test('recovers completed and stale builders', async () => {
    const builders = await listViewBuilders(workspacePath)
    const claimed = builders.find(builder => builder.viewId === 'sales-dashboard')
    const stale = builders.find(builder => builder.status === 'draft')
    if (!claimed || !stale) throw new Error('expected seeded builders')
    await beginViewBuilder(workspaceId, workspacePath, stale.id, 'Stale build')

    const reconciled = await reconcileViewBuilders(
      workspaceId,
      workspacePath,
      [
        {
          id: 'sales-dashboard',
          config: { title: 'Final sales dashboard', icon: 'briefcase' }
        }
      ],
      new Set()
    )
    expect(reconciled.find(builder => builder.id === claimed.id)?.status).toBe('ready')
    expect(reconciled.find(builder => builder.id === claimed.id)?.title).toBe(
      'Final sales dashboard'
    )
    expect(reconciled.find(builder => builder.id === claimed.id)?.icon).toBe('briefcase')
    expect(reconciled.find(builder => builder.id === stale.id)?.status).toBe('waiting')
  })

  test('only draft and waiting builders can be discarded', async () => {
    const builders = await listViewBuilders(workspacePath)
    const ready = builders.find(builder => builder.status === 'ready')
    const waiting = builders.find(builder => builder.status === 'waiting')
    const draft = builders.find(builder => builder.status === 'draft')
    if (!ready || !waiting || !draft) throw new Error('expected all deletion states')

    await expect(deleteViewBuilder(workspaceId, workspacePath, ready.id)).rejects.toBeInstanceOf(
      ViewBuilderError
    )
    await deleteViewBuilder(workspaceId, workspacePath, waiting.id)
    await deleteViewBuilder(workspaceId, workspacePath, draft.id)
    const remaining = await listViewBuilders(workspacePath)
    expect(remaining.some(builder => builder.id === waiting.id)).toBe(false)
    expect(remaining.some(builder => builder.id === draft.id)).toBe(false)
  })
})
