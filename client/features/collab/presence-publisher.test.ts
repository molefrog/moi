import { expect, test } from 'bun:test'

import type { CollabClientMessage, CollabJsonValue } from '@/lib/collab/types'

import { createPresencePublisher } from './presence-publisher'
import { CollabStore } from './store'

const welcome = {
  type: 'welcome' as const,
  version: 2 as const,
  connectionId: 'self',
  participants: [],
  users: []
}
const hasPresence = (value: CollabJsonValue) => value !== false && value !== null

function room() {
  const store = new CollabStore()
  const sent: CollabClientMessage[] = []
  store.setSender(message => sent.push(message))
  store.receive(welcome)
  const publisher = (
    registrationId: string,
    channel: string,
    isPresent?: (value: CollabJsonValue) => boolean
  ) =>
    createPresencePublisher(
      {
        setPresence: registration => store.setPresence(registration),
        deletePresence: id => store.deletePresence(id)
      },
      { registrationId, surface: 'view:board', channel },
      isPresent
    )
  return { store, sent, publisher }
}

test('hundreds of idle built-in controls leave capacity for the focused control', () => {
  const { sent, publisher } = room()
  const fields = Array.from({ length: 100 }, (_, index) =>
    publisher(`field-${index}`, `field:task-${index}`, hasPresence)
  )
  for (let index = 0; index < 100; index++) {
    fields[index]!.publish(false, true)
    publisher(`selection-${index}`, `selection:task-${index}`, hasPresence).publish(false, true)
    publisher(`cursor-${index}`, `cursor:surface-${index}`, hasPresence).publish(null, true)
  }
  expect(sent).toEqual([])
  fields[99]!.publish(true, true)
  expect(sent).toEqual([
    {
      type: 'presence:set',
      registrationId: 'field-99',
      surface: 'view:board',
      channel: 'field:task-99',
      value: true
    }
  ])
})

test('blur, deselection and pointer leave remove registrations once', () => {
  const { sent, publisher } = room()
  for (const [id, active, inactive] of [
    ['field', true, false],
    ['selection', true, false],
    ['cursor', { x: 1, y: 2 }, null]
  ] as const) {
    const owner = publisher(id, `${id}:target`, hasPresence)
    owner.publish(active, true)
    owner.publish(inactive, true)
    owner.publish(inactive, true)
    owner.clear()
  }
  expect(sent.filter(message => message.type === 'presence:set')).toHaveLength(3)
  expect(sent.filter(message => message.type === 'presence:delete')).toEqual([
    { type: 'presence:delete', registrationId: 'field' },
    { type: 'presence:delete', registrationId: 'selection' },
    { type: 'presence:delete', registrationId: 'cursor' }
  ])
})

test('hidden or inactive owners and unmounts stay cleared across reconnect', () => {
  const { store, sent, publisher } = room()
  const hidden = publisher('hidden', 'field:hidden', hasPresence)
  const unmounted = publisher('unmounted', 'field:unmounted', hasPresence)
  const visible = publisher('visible', 'field:visible', hasPresence)
  hidden.publish(true, true)
  unmounted.publish(true, true)
  visible.publish(true, true)
  store.disconnect()
  hidden.publish(true, false)
  unmounted.clear()
  sent.length = 0
  store.receive(welcome)
  expect(sent.map(message => message.type === 'presence:set' && message.registrationId)).toEqual([
    'visible'
  ])
  hidden.publish(true, true)
  expect(sent.at(-1)).toMatchObject({ type: 'presence:set', registrationId: 'hidden', value: true })
})

test('changing a target replaces its channel and never reconnects the old target', () => {
  const { store, sent, publisher } = room()
  const oldTarget = publisher('same-owner', 'field:first', hasPresence)
  oldTarget.publish(true, true)
  store.disconnect()
  oldTarget.clear()
  const nextTarget = publisher('same-owner', 'field:second', hasPresence)
  nextTarget.publish(true, true)
  sent.length = 0
  store.receive(welcome)
  expect(sent).toHaveLength(1)
  expect(sent[0]).toMatchObject({ type: 'presence:set', channel: 'field:second' })
})

test('custom publishers preserve false and null as values, including reconnect', () => {
  const { store, sent, publisher } = room()
  publisher('false-value', 'custom:toggle').publish(false, true)
  publisher('null-value', 'custom:nullable').publish(null, true)
  store.disconnect()
  sent.length = 0
  store.receive(welcome)
  expect(sent.map(message => message.type === 'presence:set' && message.value)).toEqual([
    false,
    null
  ])
})
