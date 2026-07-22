import { describe, expect, test } from 'bun:test'

import type { WorkspaceEntry } from '@/lib/types'

import { resolveWorkspacePreview, upsertWorkspaceEntry } from './api'

const existing: WorkspaceEntry = {
  id: 'one',
  path: '/tmp/one',
  addedAt: '2026-01-01T00:00:00.000Z',
  name: 'Old name'
}

describe('upsertWorkspaceEntry', () => {
  test('appends a new workspace', () => {
    const added: WorkspaceEntry = {
      id: 'two',
      path: '/tmp/two',
      addedAt: '2026-01-02T00:00:00.000Z'
    }

    expect(upsertWorkspaceEntry([existing], added)).toEqual([existing, added])
  })

  test('updates an existing workspace without duplicating it', () => {
    const imported: WorkspaceEntry = {
      ...existing,
      name: 'Updated name'
    }

    expect(upsertWorkspaceEntry([existing], imported)).toEqual([imported])
  })

  test('deduplicates a registry match returned with a different id', () => {
    const imported: WorkspaceEntry = {
      ...existing,
      id: 'replacement',
      name: 'Updated name'
    }

    expect(upsertWorkspaceEntry([existing], imported)).toEqual([imported])
  })
})

describe('resolveWorkspacePreview', () => {
  test('uses provider activity when it is available', () => {
    expect(resolveWorkspacePreview(existing, { thumbnails: ['preview'], updatedAt: 200 })).toEqual({
      thumbnails: ['preview'],
      updatedAt: 200
    })
  })

  test('falls back to the date the workspace was added', () => {
    expect(resolveWorkspacePreview(existing, undefined)).toEqual({
      thumbnails: [],
      updatedAt: new Date(existing.addedAt).getTime()
    })
  })
})
