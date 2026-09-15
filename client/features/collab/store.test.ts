import { describe, expect, test } from 'bun:test'

import type { CollabClientMessage, CollabJsonValue } from '@/lib/collab/types'

import { CollabStore } from './store'

const IDENTITY = { id: 'alice', name: 'Alice', color: '#0f766e' }
const SCOPE = 'shared:tasks'

function fixture(entries: Record<string, CollabJsonValue> = {}) {
  const store = new CollabStore()
  const sent: CollabClientMessage[] = []
  store.setSender(message => sent.push(message))
  const welcome = () =>
    store.receive({
      type: 'welcome',
      version: 1,
      connectionId: crypto.randomUUID(),
      identity: IDENTITY,
      participants: []
    })
  welcome()
  const release = store.acquireScope(SCOPE)
  const subscription = () => {
    const message = sent.findLast(item => item.type === 'subscribe')
    if (!message || message.type !== 'subscribe') throw new Error('No subscription')
    return message.subscriptionId
  }
  const snapshot = (next: Record<string, CollabJsonValue>, revision: number) =>
    store.receive({
      type: 'snapshot',
      scope: SCOPE,
      entries: next,
      revision,
      subscriptionId: subscription()
    })
  snapshot(entries, 1)
  const mutations = () => sent.filter(message => message.type === 'mutate')
  return { store, sent, welcome, snapshot, subscription, mutations, release }
}

describe('collab client state', () => {
  test('an ack alone cannot skip an intervening authoritative field update', async () => {
    const f = fixture({ title: 'Original', done: false })
    const result = f.store.mutate(SCOPE, [{ type: 'set', key: 'title', value: 'Mine' }])
    const operationId = f.mutations()[0].operationId
    f.store.receive({ type: 'ack', scope: SCOPE, operationId, revision: 3, duplicate: false })
    expect(await result).toEqual({ status: 'committed', revision: 3 })
    expect(f.store.getScopeSnapshot(SCOPE).revision).toBe(1)
    expect(f.store.getScopeSnapshot(SCOPE).entries.title).toBe('Mine')
    expect(f.store.getSnapshot().pendingCount).toBe(0)
    f.store.receive({
      type: 'update',
      scope: SCOPE,
      revision: 2,
      operationId: 'remote',
      subscriptionId: f.subscription(),
      operations: [{ type: 'set', key: 'done', value: true }]
    })
    expect(f.store.getScopeSnapshot(SCOPE).entries).toEqual({ title: 'Mine', done: true })
    f.store.receive({
      type: 'update',
      scope: SCOPE,
      revision: 3,
      operationId,
      subscriptionId: f.subscription(),
      operations: [{ type: 'set', key: 'title', value: 'Mine' }]
    })
    expect(f.store.getScopeSnapshot(SCOPE).revision).toBe(3)
    expect(f.store.getScopeSnapshot(SCOPE).entries).toEqual({ title: 'Mine', done: true })
  })

  test('a newer snapshot retires an acknowledged value layer', async () => {
    const f = fixture({ title: 'Original' })
    const result = f.store.mutate(SCOPE, [{ type: 'set', key: 'title', value: 'Mine' }])
    f.store.receive({
      type: 'ack',
      scope: SCOPE,
      operationId: f.mutations()[0].operationId,
      revision: 2,
      duplicate: false
    })
    await result
    f.store.disconnect()
    f.welcome()
    f.snapshot({ title: 'Newer remote edit' }, 3)
    expect(f.store.getScopeSnapshot(SCOPE).entries.title).toBe('Newer remote edit')
    expect(f.store.getScopeSnapshot(SCOPE).isSaving).toBe(false)
  })

  test('independent remote fields survive a pending local field edit', async () => {
    const f = fixture({ '42/title': 'Before', '42/done': false })
    const result = f.store.mutate(SCOPE, [{ type: 'set', key: '42/title', value: 'After' }])
    f.store.receive({
      type: 'update',
      scope: SCOPE,
      revision: 2,
      operationId: 'remote',
      subscriptionId: f.subscription(),
      operations: [{ type: 'set', key: '42/done', value: true }]
    })
    expect(f.store.getScopeSnapshot(SCOPE).entries).toEqual({
      '42/title': 'After',
      '42/done': true
    })
    f.store.receive({
      type: 'ack',
      scope: SCOPE,
      revision: 3,
      operationId: f.mutations()[0].operationId,
      duplicate: false
    })
    expect(await result).toEqual({ status: 'committed', revision: 3 })
    expect(f.store.getScopeSnapshot(SCOPE).entries).toEqual({
      '42/title': 'After',
      '42/done': true
    })
  })

  test('rejecting an earlier optimistic write preserves the later write', async () => {
    const f = fixture({ title: 'Original' })
    const first = f.store.mutate(SCOPE, [{ type: 'set', key: 'title', value: 'First' }])
    const second = f.store.mutate(SCOPE, [{ type: 'set', key: 'title', value: 'Second' }])
    f.store.receive({
      type: 'error',
      code: 'write_failed',
      message: 'Disk full',
      operationId: f.mutations()[0].operationId
    })
    expect(f.store.getScopeSnapshot(SCOPE).entries.title).toBe('Second')
    f.store.receive({
      type: 'ack',
      scope: SCOPE,
      revision: 2,
      operationId: f.mutations()[1].operationId,
      duplicate: false
    })
    expect((await first).status).toBe('rejected')
    expect((await second).status).toBe('committed')
    expect(f.store.getScopeSnapshot(SCOPE).entries.title).toBe('Second')
  })

  test('the own update retires its optimistic layer before a newer remote update', async () => {
    const f = fixture({ title: 'Original' })
    const result = f.store.mutate(SCOPE, [{ type: 'set', key: 'title', value: 'Mine' }])
    f.store.receive({
      type: 'update',
      scope: SCOPE,
      revision: 2,
      operationId: f.mutations()[0].operationId,
      subscriptionId: f.subscription(),
      operations: [{ type: 'set', key: 'title', value: 'Mine' }]
    })
    f.store.receive({
      type: 'update',
      scope: SCOPE,
      revision: 3,
      operationId: 'remote',
      subscriptionId: f.subscription(),
      operations: [{ type: 'set', key: 'title', value: 'Theirs' }]
    })
    f.store.receive({
      type: 'ack',
      scope: SCOPE,
      revision: 2,
      operationId: f.mutations()[0].operationId,
      duplicate: false
    })
    await result
    expect(f.store.getScopeSnapshot(SCOPE).entries.title).toBe('Theirs')
  })

  test('reconnect checks receipts without replaying an uncertain write', async () => {
    const f = fixture({ title: 'Original' })
    const result = f.store.mutate(SCOPE, [{ type: 'set', key: 'title', value: 'Maybe saved' }])
    const operationId = f.mutations()[0].operationId
    f.store.disconnect()
    expect(f.store.getScopeSnapshot(SCOPE).loaded).toBe(true)
    expect(f.store.getScopeSnapshot(SCOPE).synced).toBe(false)
    expect(f.store.getScopeSnapshot(SCOPE).entries.title).toBe('Maybe saved')
    f.welcome()
    f.snapshot({ title: 'Original' }, 1)
    expect(f.mutations()).toHaveLength(1)
    expect(
      f.sent.some(
        message => message.type === 'receipts' && message.operationIds.includes(operationId)
      )
    ).toBe(true)
    f.store.receive({
      type: 'receipts',
      requestId: 'lookup',
      receipts: [{ operationId, status: 'unknown' }]
    })
    expect((await result).status).toBe('unknown')
    expect(f.store.getScopeSnapshot(SCOPE).entries.title).toBe('Original')
    expect(f.store.getScopeSnapshot(SCOPE).error).toContain('could not be confirmed')
  })

  test('a committed receipt never reapplies an older edit over the fresh snapshot', async () => {
    const f = fixture({ title: 'Original' })
    const result = f.store.mutate(SCOPE, [{ type: 'set', key: 'title', value: 'Mine' }])
    const operationId = f.mutations()[0].operationId
    f.store.disconnect()
    f.welcome()
    f.snapshot({ title: 'Newer remote edit' }, 3)
    f.store.receive({
      type: 'receipts',
      requestId: 'lookup',
      receipts: [{ operationId, status: 'committed', scope: SCOPE, revision: 2 }]
    })
    expect((await result).status).toBe('committed')
    expect(f.store.getScopeSnapshot(SCOPE).entries.title).toBe('Newer remote edit')
  })

  test('old subscription snapshots cannot overwrite a remounted subscription', () => {
    const f = fixture({ title: 'Original' })
    const oldSubscription = f.subscription()
    f.release()
    f.store.acquireScope(SCOPE)
    f.snapshot({ title: 'Current' }, 3)
    f.store.receive({
      type: 'snapshot',
      scope: SCOPE,
      revision: 1,
      entries: { title: 'Stale' },
      subscriptionId: oldSubscription
    })
    expect(f.store.getScopeSnapshot(SCOPE).entries.title).toBe('Current')
  })

  test('reading a missing key never seeds storage and offline writes are rejected', async () => {
    const f = fixture()
    expect(f.store.getScopeSnapshot(SCOPE).entries.missing).toBeUndefined()
    expect(f.mutations()).toHaveLength(0)
    f.store.disconnect()
    const result = await f.store.mutate(SCOPE, [{ type: 'set', key: 'title', value: 'Offline' }])
    expect(result.status).toBe('rejected')
    expect(f.mutations()).toHaveLength(0)
  })

  test('presence cleanup removes only the owning registration', () => {
    const f = fixture()
    f.store.setPresence({
      registrationId: 'field-a',
      surface: 'widget:a',
      channel: 'focus',
      value: true
    })
    f.store.setPresence({
      registrationId: 'field-b',
      surface: 'widget:b',
      channel: 'focus',
      value: true
    })
    f.store.deletePresence('field-a')
    f.store.disconnect()
    f.sent.length = 0
    f.welcome()
    const presence = f.sent.filter(message => message.type === 'presence:set')
    expect(presence).toHaveLength(1)
    expect(presence[0].registrationId).toBe('field-b')
  })

  test('a task removal batch preserves unrelated task fields', async () => {
    const f = fixture({
      '42/exists': true,
      '42/title': 'Removed',
      '43/exists': true,
      '43/title': 'Kept'
    })
    const result = f.store.mutate(SCOPE, [
      { type: 'delete', key: '42/exists' },
      { type: 'delete', key: '42/title' }
    ])
    expect(f.store.getScopeSnapshot(SCOPE).entries).toEqual({
      '43/exists': true,
      '43/title': 'Kept'
    })
    f.store.receive({
      type: 'ack',
      scope: SCOPE,
      revision: 2,
      operationId: f.mutations()[0].operationId,
      duplicate: false
    })
    await result
  })
})
