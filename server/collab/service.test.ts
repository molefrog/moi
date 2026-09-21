import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import type { CollabServerMessage } from '@/lib/collab/types'

import { CollabService } from './service'
import { openCollabStorage } from './storage'

describe('collab service', () => {
  let service: CollabService
  let messages: { connectionId: string; message: CollabServerMessage }[]

  beforeEach(() => {
    messages = []
    service = new CollabService(openCollabStorage(':memory:'), (connectionId, message) => {
      messages.push({ connectionId, message: structuredClone(message) })
    })
  })
  afterEach(() => service.close())

  function join(connectionId: string, id = connectionId) {
    service.receive(connectionId, {
      type: 'join',
      version: 1,
      identity: { id, name: id, color: '#336699' },
      location: { page: 'view:board' }
    })
  }

  test('anonymous applets share durable state and recover receipts without joining presence', () => {
    service.receive('anon-a', { type: 'join', version: 1, identity: null, anonymousId: 'tab-a' })
    service.receive('anon-b', { type: 'join', version: 1, identity: null, anonymousId: 'tab-b' })
    join('person')
    for (const { message } of messages) {
      if (message.type === 'participants' || message.type === 'welcome') {
        expect(
          message.participants.every(participant => participant.identity.id === 'person')
        ).toBe(true)
      }
    }
    service.receive('anon-a', { type: 'subscribe', scope: 'board', subscriptionId: 'a-board' })
    service.receive('anon-b', { type: 'subscribe', scope: 'board', subscriptionId: 'b-board' })
    service.receive('anon-a', {
      type: 'mutate',
      scope: 'board',
      operationId: 'anonymous-write',
      operations: [{ type: 'set', key: 'title', value: 'Shared without a profile' }]
    })
    expect(
      messages.some(
        ({ connectionId, message }) =>
          connectionId === 'anon-b' &&
          message.type === 'update' &&
          message.operations[0]?.type === 'set' &&
          message.operations[0].value === 'Shared without a profile'
      )
    ).toBe(true)
    service.leave('anon-a')
    service.receive('anon-a-reconnected', {
      type: 'join',
      version: 1,
      identity: null,
      anonymousId: 'tab-a'
    })
    service.receive('anon-a-reconnected', {
      type: 'receipts',
      requestId: 'retry',
      operationIds: ['anonymous-write']
    })
    expect(messages.at(-1)?.message).toMatchObject({
      type: 'receipts',
      receipts: [{ operationId: 'anonymous-write', status: 'committed', revision: 1 }]
    })
    service.receive('anon-b', {
      type: 'receipts',
      requestId: 'other-tab',
      operationIds: ['anonymous-write']
    })
    expect(messages.at(-1)?.message).toMatchObject({
      type: 'receipts',
      receipts: [{ operationId: 'anonymous-write', status: 'unknown' }]
    })
    messages = []
    service.receive('anon-b', { type: 'location', location: { page: 'view:board' } })
    service.receive('anon-b', {
      type: 'presence:set',
      registrationId: 'cursor',
      surface: 'board',
      channel: 'cursor',
      value: { x: 5 }
    })
    expect(messages).toEqual([])
  })

  test('snapshot precedes updates, and only matching subscribers receive mutations', () => {
    join('a')
    join('b')
    service.receive('a', { type: 'subscribe', scope: 'board', subscriptionId: 'a-board' })
    service.receive('b', { type: 'subscribe', scope: 'other', subscriptionId: 'b-other' })
    service.receive('a', {
      type: 'mutate',
      scope: 'board',
      operationId: 'first',
      operations: [{ type: 'set', key: 'title', value: 'Shared' }]
    })
    const durable = messages.filter(item =>
      ['snapshot', 'update', 'ack'].includes(item.message.type)
    )
    expect(durable.map(item => [item.connectionId, item.message.type])).toEqual([
      ['a', 'snapshot'],
      ['b', 'snapshot'],
      ['a', 'update'],
      ['a', 'ack']
    ])
    expect(durable[0]?.message).toMatchObject({ revision: 0, entries: {} })
    expect(durable[2]?.message).toMatchObject({ revision: 1, subscriptionId: 'a-board' })
    service.receive('a', { type: 'unsubscribe', scope: 'board', subscriptionId: 'a-board' })
    messages = []
    service.run(
      { kind: 'agent', id: 'agent' },
      {
        type: 'mutate',
        scope: 'board',
        operationId: 'second',
        operations: [{ type: 'set', key: 'title', value: 'From agent' }]
      }
    )
    expect(messages).toEqual([])
  })

  test('duplicate operations return receipts without broadcasting an old edit', () => {
    join('a')
    service.receive('a', { type: 'subscribe', scope: 'board', subscriptionId: 'sub' })
    const command = {
      type: 'mutate' as const,
      scope: 'board',
      operationId: 'first',
      operations: [{ type: 'set' as const, key: 'title', value: 'First' }]
    }
    service.receive('a', command)
    service.run(
      { kind: 'agent', id: 'a' },
      {
        ...command,
        operations: [{ type: 'set', key: 'title', value: 'Newer' }]
      }
    )
    messages = []
    service.receive('a', command)
    expect(messages).toEqual([
      {
        connectionId: 'a',
        message: {
          type: 'ack',
          scope: 'board',
          operationId: 'first',
          revision: 1,
          duplicate: true
        }
      }
    ])
    expect(
      service.run({ kind: 'system', id: 'test' }, { type: 'snapshot', scope: 'board' })
    ).toMatchObject({ revision: 2, entries: { title: 'Newer' } })
  })

  test('multiple connections share identity without sharing registration ownership', async () => {
    join('tab-one', 'anna')
    join('tab-two', 'anna')
    for (const [registrationId, channel] of [
      ['field-a', 'title'],
      ['field-b', 'done']
    ]) {
      service.receive('tab-one', {
        type: 'presence:set',
        registrationId: registrationId!,
        channel: channel!,
        surface: 'view:board',
        value: { focused: true }
      })
    }
    service.receive('tab-one', { type: 'presence:delete', registrationId: 'field-a' })
    await Bun.sleep(60)
    const presence = messages.findLast(item => item.message.type === 'participants')?.message
    expect(presence?.type).toBe('participants')
    if (presence?.type !== 'participants') throw new Error('Missing participants')
    expect(presence.participants).toHaveLength(2)
    expect(presence.participants[0]?.presence.map(item => item.registrationId)).toEqual(['field-b'])
    service.leave('tab-one')
    const left = messages.at(-1)?.message
    if (left?.type !== 'participants') throw new Error('Missing leave event')
    expect(left.participants.map(item => item.connectionId)).toEqual(['tab-two'])
    expect(left.participants[0]?.presence).toEqual([])
  })

  test('identity profile updates preserve actor while changing id requires reconnect', () => {
    join('one', 'anna')
    service.receive('one', {
      type: 'identity',
      identity: { id: 'anna', name: 'Anna updated', color: 'blue' }
    })
    expect(() =>
      service.receive('one', {
        type: 'identity',
        identity: { id: 'boris', name: 'Boris', color: 'red' }
      })
    ).toThrow('Reconnect')
    expect(() => service.receive('missing', { type: 'ping' })).toThrow('Join')
  })

  test('the people directory outlives presence and announces new or changed profiles', () => {
    const ada = { id: 'ada', name: 'ada', color: '#336699' }
    const ken = { id: 'ken', name: 'ken', color: '#336699' }
    const announced = () =>
      messages.flatMap(item =>
        item.message.type === 'people'
          ? [{ to: item.connectionId, people: item.message.people }]
          : []
      )
    const welcome = (connectionId: string) => {
      const found = messages.find(
        item => item.connectionId === connectionId && item.message.type === 'welcome'
      )?.message
      if (found?.type !== 'welcome') throw new Error('No welcome')
      return found
    }
    join('a', 'ada')
    expect(welcome('a').people).toEqual([ada])
    expect(announced()).toEqual([])

    messages.length = 0
    join('b', 'ken')
    expect(announced()).toEqual([{ to: 'a', people: [ken] }])
    expect(
      welcome('b')
        .people.map(person => person.id)
        .sort()
    ).toEqual(['ada', 'ken'])

    // Leaving removes presence, not the directory entry; anonymous readers get it too.
    service.leave('a')
    messages.length = 0
    service.receive('anon', { type: 'join', version: 1, identity: null, anonymousId: 'tab' })
    expect(welcome('anon').participants.map(person => person.identity.id)).toEqual(['ken'])
    expect(
      welcome('anon')
        .people.map(person => person.id)
        .sort()
    ).toEqual(['ada', 'ken'])

    // The same profile rejoining announces nothing; a changed profile reaches everyone.
    messages.length = 0
    join('c', 'ada')
    expect(announced()).toEqual([])
    const renamed = { ...ada, name: 'Ada L' }
    service.receive('c', { type: 'identity', identity: renamed })
    expect(
      announced()
        .map(item => item.to)
        .sort()
    ).toEqual(['anon', 'b', 'c'])
    expect(announced()[0]?.people).toEqual([renamed])
  })
})
