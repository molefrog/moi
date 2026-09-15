import { expect, test } from 'bun:test'

import { isCollabActor, isCollabClientMessage, isCollabIdentity } from './protocol'

test('collab validates injected profiles as data and bounds identifiers and presence', () => {
  const identity = { id: 'anna', name: 'Anna', color: '#7c3aed' }
  expect(isCollabIdentity(identity)).toBe(true)
  expect(isCollabClientMessage({ type: 'join', version: 1, identity })).toBe(true)
  expect(isCollabClientMessage({ type: 'join', version: 2, identity })).toBe(false)
  expect(isCollabIdentity({ ...identity, id: '🙂'.repeat(100) })).toBe(false)
  expect(isCollabIdentity({ ...identity, id: 'a\0b' })).toBe(false)
  expect(isCollabActor({ id: 'agent', kind: 'agent' })).toBe(true)
  expect(isCollabActor({ id: 'agent', kind: 'admin' })).toBe(false)
  expect(
    isCollabClientMessage({
      type: 'presence:set',
      registrationId: 'field',
      surface: 'board',
      channel: 'focus',
      value: 'x'.repeat(5000)
    })
  ).toBe(false)
  expect(
    isCollabClientMessage({
      type: 'mutate',
      scope: 'board',
      operationId: 'op',
      operations: [{ type: 'set', key: 'value', value: NaN }]
    })
  ).toBe(false)
})
