import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { COLLAB_MAX_CONNECTIONS, COLLAB_MAX_REGISTRATIONS } from '@/lib/collab/protocol'
import type { CollabServerMessage } from '@/lib/collab/types'

import { CollabService } from './service'

describe('collab service', () => {
  let service: CollabService
  let messages: { connectionId: string; message: CollabServerMessage }[]

  beforeEach(() => {
    messages = []
    service = new CollabService((connectionId, message) => {
      messages.push({ connectionId, message: structuredClone(message) })
    })
  })
  afterEach(() => service.close())

  function join(connectionId: string, id = connectionId) {
    service.receive(connectionId, {
      type: 'join',
      version: 2,
      identity: { id, name: id, color: '#336699' },
      location: { page: 'view:board' }
    })
  }

  function latest() {
    const message = messages.findLast(item => item.message.type === 'participants')?.message
    if (message?.type !== 'participants') throw new Error('Missing participants')
    return message
  }

  test('welcomes connections with separate user profiles and user IDs', () => {
    join('a', 'anna')
    join('b', 'boris')
    const welcome = messages.find(
      item => item.connectionId === 'b' && item.message.type === 'welcome'
    )?.message
    expect(welcome).toEqual({
      type: 'welcome',
      version: 2,
      connectionId: 'b',
      participants: [
        { connectionId: 'a', userId: 'anna', location: { page: 'view:board' }, presence: [] },
        { connectionId: 'b', userId: 'boris', location: { page: 'view:board' }, presence: [] }
      ],
      users: [
        { id: 'anna', name: 'anna', color: '#336699' },
        { id: 'boris', name: 'boris', color: '#336699' }
      ]
    })
  })

  test('multiple connections share a profile without sharing registration ownership', async () => {
    join('tab-one', 'anna')
    join('tab-two', 'anna')
    for (const registrationId of ['field-a', 'field-b']) {
      service.receive('tab-one', {
        type: 'presence:set',
        registrationId,
        channel: 'focus',
        surface: 'view:board',
        value: { focused: true }
      })
    }
    service.receive('tab-one', { type: 'presence:delete', registrationId: 'field-a' })
    await Bun.sleep(60)
    expect(latest().participants).toHaveLength(2)
    expect(latest().participants[0]?.presence.map(item => item.registrationId)).toEqual(['field-b'])
    expect(latest().users).toHaveLength(1)
    service.leave('tab-one')
    expect(latest().participants.map(item => item.connectionId)).toEqual(['tab-two'])
    expect(latest().participants[0]?.presence).toEqual([])
    expect(latest().users).toHaveLength(1)
  })

  test('profiles disappear after their final connection leaves', () => {
    join('observer')
    join('one', 'anna')
    join('two', 'anna')
    service.leave('one')
    expect(latest().users.map(user => user.id)).toEqual(['observer', 'anna'])
    service.leave('two')
    expect(latest().users.map(user => user.id)).toEqual(['observer'])
    join('new-observer')
    expect(latest().users.map(user => user.id)).toEqual(['observer', 'new-observer'])
  })

  test('profile updates reach other tabs while identity changes require reconnecting', () => {
    join('one', 'anna')
    join('two', 'anna')
    const identity = { id: 'anna', name: 'Anna updated', color: 'blue', email: 'anna@example.com' }
    service.receive('one', { type: 'identity', identity })
    expect(latest().users).toEqual([identity])
    service.leave('one')
    expect(latest().users).toEqual([identity])
    expect(() =>
      service.receive('two', {
        type: 'identity',
        identity: { id: 'boris', name: 'Boris', color: 'red' }
      })
    ).toThrow('Reconnect')
    expect(() => service.receive('missing', { type: 'ping' })).toThrow('Join')
    expect(() => join('two', 'anna')).toThrow('already joined')
  })

  test('presence and location updates are coalesced and deletion clears a registration', async () => {
    join('one')
    messages = []
    service.receive('one', { type: 'location', location: { page: 'view:board', away: true } })
    service.receive('one', {
      type: 'presence:set',
      registrationId: 'cursor',
      surface: 'board',
      channel: 'cursor',
      value: { x: 10 }
    })
    service.receive('one', {
      type: 'presence:set',
      registrationId: 'cursor',
      surface: 'board',
      channel: 'cursor',
      value: { x: 20 }
    })
    expect(messages).toEqual([])
    await Bun.sleep(60)
    expect(messages).toHaveLength(1)
    expect(latest().participants[0]).toMatchObject({
      location: { page: 'view:board', away: true },
      presence: [{ value: { x: 20 } }]
    })
    service.receive('one', { type: 'presence:delete', registrationId: 'cursor' })
    await Bun.sleep(60)
    expect(latest().participants[0]?.presence).toEqual([])
  })

  test('accepts 64 connections, rejects the next join, and reuses a freed slot', () => {
    for (let index = 0; index < COLLAB_MAX_CONNECTIONS; index++) join(String(index))
    expect(latest().participants).toHaveLength(64)
    expect(() => join('overflow')).toThrow('too many connections')
    service.leave('0')
    expect(() => join('replacement')).not.toThrow()
    expect(latest().participants).toHaveLength(64)
    expect(latest().participants.some(participant => participant.connectionId === '0')).toBe(false)
  })

  test('accepts 128 registrations, permits updates at capacity, and reuses a freed slot', async () => {
    join('one')
    const registration = {
      type: 'presence:set' as const,
      surface: 'board',
      channel: 'focus',
      value: true
    }
    for (let index = 0; index < COLLAB_MAX_REGISTRATIONS; index++)
      service.receive('one', { ...registration, registrationId: String(index) })
    expect(() => service.receive('one', { ...registration, registrationId: 'overflow' })).toThrow(
      'Too many presence'
    )
    expect(() =>
      service.receive('one', { ...registration, registrationId: '0', value: false })
    ).not.toThrow()
    await Bun.sleep(60)
    expect(latest().participants[0]?.presence).toHaveLength(128)
    expect(latest().participants[0]?.presence[0]?.value).toBe(false)
    service.receive('one', { type: 'presence:delete', registrationId: '0' })
    expect(() =>
      service.receive('one', { ...registration, registrationId: 'replacement' })
    ).not.toThrow()
    await Bun.sleep(60)
    expect(latest().participants[0]?.presence).toHaveLength(128)
    expect(latest().participants[0]?.presence.at(-1)?.registrationId).toBe('replacement')
  })

  test('heartbeat replies immediately and closing the room clears pending broadcasts', async () => {
    join('one')
    service.receive('one', { type: 'ping' })
    expect(messages.at(-1)).toEqual({ connectionId: 'one', message: { type: 'pong' } })
    service.receive('one', { type: 'location', location: null })
    service.close()
    messages = []
    await Bun.sleep(60)
    expect(messages).toEqual([])
  })
})
