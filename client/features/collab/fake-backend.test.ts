import { expect, test } from 'bun:test'

import type { CollabParticipant } from '@/lib/collab/types'

import { createFakeBackend } from './fake-backend'

const me = { id: 'me', name: 'Me', color: '#8b5cf6' }
const fig = { id: 'fig', name: 'Fig', color: '#f59e0b' }
const figHere: CollabParticipant = {
  connectionId: 'bot-fig',
  identity: fig,
  location: { page: 'kit' },
  presence: []
}

test('the fake room connects at once with the viewer, everyone else, and the directory', () => {
  const room = createFakeBackend({
    self: me,
    page: 'kit',
    others: [figHere],
    people: [{ id: 'ada', name: 'Ada', color: '#84cc16' }]
  })
  const state = room.getSnapshot()
  expect(state.status).toBe('connected')
  expect(state.participants.map(participant => participant.identity.id)).toEqual(['me', 'fig'])
  expect(Object.keys(state.people).sort()).toEqual(['ada', 'fig', 'me'])
  expect(room.getIdentity()).toEqual(me)
  expect(room.getLocation()).toEqual({ page: 'kit' })
})

test('presence lands on the viewer and other people can be replaced', () => {
  const room = createFakeBackend({ self: me, others: [figHere] })
  room.setPresence({ registrationId: 'r1', surface: 'view:kit', channel: 'custom:mood', value: 1 })
  expect(room.getSnapshot().participants[0]?.presence).toHaveLength(1)
  room.deletePresence('r1')
  expect(room.getSnapshot().participants[0]?.presence).toHaveLength(0)
  room.setOthers([])
  expect(room.getSnapshot().participants.map(participant => participant.identity.id)).toEqual([
    'me'
  ])
})

test('shared state loads, commits the viewer’s writes, and receives other people’s', async () => {
  const room = createFakeBackend({ self: null, entries: { demo: { note: 'hello' } } })
  const release = room.acquireScope('demo')
  expect(room.getScopeSnapshot('demo')).toMatchObject({
    loaded: true,
    synced: true,
    entries: { note: 'hello' }
  })
  const outcome = await room.mutate('demo', [{ type: 'set', key: 'done', value: true }])
  expect(outcome).toEqual({ status: 'committed', revision: 1 })
  room.write('demo', [{ type: 'set', key: 'note', value: 'Fig was here' }])
  expect(room.getScopeSnapshot('demo').entries).toEqual({ note: 'Fig was here', done: true })
  expect(await room.mutate('demo', [])).toMatchObject({ status: 'rejected' })
  release()
})

test('a slow room shows the write at once and saving until it commits', async () => {
  const room = createFakeBackend({ self: me, latency: 20 })
  room.acquireScope('demo')
  await Bun.sleep(30)
  const saving = room.mutate('demo', [{ type: 'set', key: 'note', value: 'draft' }])
  expect(room.getScopeSnapshot('demo')).toMatchObject({
    entries: { note: 'draft' },
    isSaving: true
  })
  expect(await saving).toMatchObject({ status: 'committed' })
  expect(room.getScopeSnapshot('demo').isSaving).toBe(false)
})
