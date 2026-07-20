import { expect, test } from 'bun:test'

import { api } from './api'

function createWorkspace(type: unknown) {
  return api.request('/api/workspaces/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'test-workspace', type })
  })
}

test('creating a workspace defaults a missing provider type to Claude Code', async () => {
  const response = await api.request('/api/workspaces/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '' })
  })

  expect(response.status).toBe(400)
  expect(await response.text()).toBe('Folder name is required')
})

test('creating a workspace rejects an unknown provider type', async () => {
  const response = await createWorkspace('unknown-provider')

  expect(response.status).toBe(400)
  expect(await response.text()).toBe('Unknown workspace type')
})

test('creating a workspace rejects a provider that only supports discovery', async () => {
  const response = await createWorkspace('openclaw')

  expect(response.status).toBe(400)
  expect(await response.text()).toBe(
    'Workspaces of this type arrive through discovery, not creation'
  )
})
