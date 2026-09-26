import { expect, test } from 'bun:test'

import {
  COLLAB_MAX_AVATAR_BYTES,
  COLLAB_MAX_EMAIL_BYTES,
  COLLAB_MAX_PRESENCE_BYTES,
  isCollabClientMessage,
  isCollabIdentity
} from './protocol'

const identity = { id: 'anna', name: 'Anna', color: '#7c3aed' }
const presence = {
  type: 'presence:set',
  registrationId: 'field',
  surface: 'board',
  channel: 'focus'
}

test('profiles have bounded identifiers and optional avatar and email data', () => {
  expect(isCollabIdentity(identity)).toBe(true)
  expect(
    isCollabIdentity({
      ...identity,
      email: 'anna@example.com',
      avatar: 'https://example.com/avatar'
    })
  ).toBe(true)
  expect(isCollabIdentity({ ...identity, id: '🙂'.repeat(100) })).toBe(false)
  expect(isCollabIdentity({ ...identity, id: 'a\0b' })).toBe(false)
  expect(isCollabIdentity({ ...identity, email: 'x'.repeat(COLLAB_MAX_EMAIL_BYTES) })).toBe(true)
  expect(isCollabIdentity({ ...identity, email: 'x'.repeat(COLLAB_MAX_EMAIL_BYTES + 1) })).toBe(
    false
  )
  expect(isCollabIdentity({ ...identity, email: '🙂'.repeat(81) })).toBe(false)
  expect(isCollabIdentity({ ...identity, email: null })).toBe(false)
  expect(isCollabIdentity({ ...identity, avatar: 'x'.repeat(COLLAB_MAX_AVATAR_BYTES + 1) })).toBe(
    false
  )
})

test('only identified protocol v2 clients can join', () => {
  expect(isCollabClientMessage({ type: 'join', version: 2, identity })).toBe(true)
  expect(isCollabClientMessage({ type: 'join', version: 1, identity })).toBe(false)
  expect(
    isCollabClientMessage({ type: 'join', version: 2, identity: null, anonymousId: 'tab' })
  ).toBe(false)
  expect(
    isCollabClientMessage({ type: 'join', version: 2, identity, location: { page: 'view:board' } })
  ).toBe(true)
  expect(
    isCollabClientMessage({ type: 'join', version: 2, identity, location: { page: '' } })
  ).toBe(false)
})

test('presence bounds JSON bytes, nesting and finite numbers', () => {
  expect(isCollabClientMessage({ ...presence, value: { x: 12, focused: true } })).toBe(true)
  expect(isCollabClientMessage({ ...presence, value: 'x'.repeat(COLLAB_MAX_PRESENCE_BYTES) })).toBe(
    false
  )
  expect(isCollabClientMessage({ ...presence, value: '🙂'.repeat(1100) })).toBe(false)
  expect(isCollabClientMessage({ ...presence, value: NaN })).toBe(false)
  expect(isCollabClientMessage({ ...presence, value: Infinity })).toBe(false)
  let nested: unknown = null
  for (let index = 0; index < 26; index++) nested = [nested]
  expect(isCollabClientMessage({ ...presence, value: nested })).toBe(false)
})

test('storage operations are no longer part of the protocol', () => {
  for (const type of ['subscribe', 'unsubscribe', 'mutate', 'receipts', 'snapshot', 'export']) {
    expect(
      isCollabClientMessage({
        type,
        scope: 'board',
        subscriptionId: 'sub',
        operationId: 'op',
        operations: [{ type: 'set', key: 'title', value: 'Hello' }],
        requestId: 'req',
        operationIds: ['op']
      })
    ).toBe(false)
  }
  expect(isCollabClientMessage({ type: 'ping' })).toBe(true)
  expect(isCollabClientMessage({ type: 'location', location: null })).toBe(true)
  expect(isCollabClientMessage({ type: 'presence:delete', registrationId: '' })).toBe(false)
})
