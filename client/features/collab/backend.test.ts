import { afterEach, expect, test } from 'bun:test'
import { createLiveBackend } from './backend'
import { CollabClient } from './client'
import { setIdentity, setWorkspaceUsers } from './identity'

const alice = { id: 'alice', name: 'Alice', color: '#0f766e' }
afterEach(() => {
  setIdentity(null)
  setWorkspaceUsers('disabled-test', null)
})

test('disabled runtime resolves its host directory but cannot publish or expose live participants', () => {
  setIdentity(alice)
  setWorkspaceUsers('disabled-test', [alice])
  const client = new CollabClient('disabled-test')
  const backend = createLiveBackend(client, false)
  let sends = 0
  client.store.setSender(() => sends++)
  client.store.receive({
    type: 'welcome',
    version: 2,
    connectionId: 'local',
    users: [alice],
    participants: [
      { connectionId: 'local', userId: 'alice', location: { page: 'overview' }, presence: [] }
    ]
  })
  backend.setPresence({
    registrationId: 'field',
    surface: 'board',
    channel: 'field:title',
    value: true
  })
  backend.deletePresence('field')
  expect(sends).toBe(0)
  expect(backend.getSnapshot()).toMatchObject({ status: 'disconnected', participants: [] })
  expect(backend.getWorkspaceUsers()).toEqual([alice])
  expect(backend.getIdentity()).toEqual(alice)
})
