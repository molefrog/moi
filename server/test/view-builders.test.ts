import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  ViewBuilderError,
  beginViewBuilder,
  claimViewBuilder,
  createViewBuilder,
  deleteViewBuilder,
  listViewBuilders,
  markViewBuilderBuildingBySession,
  markViewBuilderWaitingBySession,
  reconcileViewBuilders,
  renameViewBuilderSession,
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

    const claimed = await claimViewBuilder(
      workspaceId,
      workspacePath,
      first.id,
      'sales-dashboard',
      'Sales dashboard'
    )
    expect(claimed.viewId).toBe('sales-dashboard')

    const renamed = await claimViewBuilder(
      workspaceId,
      workspacePath,
      first.id,
      'sales-dashboard',
      'Revenue dashboard'
    )
    expect(renamed.title).toBe('Revenue dashboard')
    await expect(
      claimViewBuilder(workspaceId, workspacePath, first.id, 'different-id', 'Different')
    ).rejects.toBeInstanceOf(ViewBuilderError)
    await expect(
      claimViewBuilder(workspaceId, workspacePath, second.id, 'sales-dashboard', 'Duplicate')
    ).rejects.toBeInstanceOf(ViewBuilderError)
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
      [{ id: 'sales-dashboard', config: { title: 'Final sales dashboard' } }],
      new Set()
    )
    expect(reconciled.find(builder => builder.id === claimed.id)?.status).toBe('ready')
    expect(reconciled.find(builder => builder.id === claimed.id)?.title).toBe(
      'Final sales dashboard'
    )
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
