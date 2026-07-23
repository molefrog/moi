import { describe, expect, test } from 'bun:test'

import type { WorkspaceEntry } from '@/lib/types'

import { upsertWorkspaceEntry } from './api'

const existing: WorkspaceEntry = {
  id: 'one',
  path: '/tmp/one',
  addedAt: '2026-01-01T00:00:00.000Z',
  name: 'Old name'
}

describe('upsertWorkspaceEntry', () => {
  test('prepends a new workspace', () => {
    const added: WorkspaceEntry = {
      id: 'two',
      path: '/tmp/two',
      addedAt: '2026-01-02T00:00:00.000Z'
    }

    expect(upsertWorkspaceEntry([existing], added)).toEqual([added, existing])
  })

  test('updates an existing workspace in place without duplicating it', () => {
    const other: WorkspaceEntry = {
      id: 'two',
      path: '/tmp/two',
      addedAt: '2026-01-02T00:00:00.000Z'
    }
    const imported: WorkspaceEntry = {
      ...existing,
      name: 'Updated name'
    }

    expect(upsertWorkspaceEntry([other, existing], imported)).toEqual([other, imported])
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
