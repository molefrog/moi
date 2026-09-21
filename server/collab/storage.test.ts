import { Database } from 'bun:sqlite'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { CollabJsonValue, CollabOperation } from '@/lib/collab/types'

import { COLLAB_STORAGE_LIMITS, openCollabStorage, type CollabStorage } from './storage'

describe('collab storage', () => {
  let directory: string
  let path: string
  let storage: CollabStorage
  let timestamp: number

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'moi-collab-storage-'))
    path = join(directory, '.moi', 'data', 'collab.sqlite')
    timestamp = Date.UTC(2026, 8, 15)
    storage = openCollabStorage(path, { now: () => timestamp })
  })

  afterEach(() => {
    storage.close()
    rmSync(directory, { recursive: true, force: true })
  })

  const set = (key: string, value: CollabJsonValue): CollabOperation => ({
    type: 'set',
    key,
    value
  })

  test('reading an absent scope never initializes values or advances revisions', () => {
    expect(storage.snapshot('board')).toEqual({ scope: 'board', revision: 0, entries: {} })
    expect(storage.snapshot('board')).toEqual({ scope: 'board', revision: 0, entries: {} })
    storage.mutate('board', 'anna', 'create', [set('title', 'Created deliberately')])
    expect(storage.snapshot('board').revision).toBe(1)
    expect(storage.snapshot('other').revision).toBe(0)
  })

  test('interleaved participants preserve distinct fields and converge on the last same-key commit', async () => {
    const commits = await Promise.all([
      Promise.resolve().then(() =>
        storage.mutate('board', 'anna', 'title', [set('task/1/title', 'A')])
      ),
      Promise.resolve().then(() =>
        storage.mutate('board', 'boris', 'done', [set('task/1/done', true)])
      ),
      Promise.resolve().then(() =>
        storage.mutate('board', 'boris', 'rename', [set('task/1/title', 'B')])
      )
    ])
    expect(commits.map(commit => commit.revision)).toEqual([1, 2, 3])
    expect(storage.snapshot('board')).toEqual({
      scope: 'board',
      revision: 3,
      entries: { 'task/1/title': 'B', 'task/1/done': true }
    })
    storage.mutate('other', 'anna', 'other-write', [set('value', 1)])
    expect(storage.snapshot('board').revision).toBe(3)
    expect(storage.snapshot('other').revision).toBe(1)
  })

  test('a batch is ordered and receives one revision', () => {
    const result = storage.mutate('board', 'anna', 'batch', [
      set('value', 1),
      { type: 'delete', key: 'value' },
      set('value', 2),
      set('other', null)
    ])
    expect(result.revision).toBe(1)
    expect(storage.snapshot('board').entries).toEqual({ value: 2, other: null })
    storage.mutate('board', 'anna', 'empty', [])
    expect(storage.snapshot('board').revision).toBe(2)
  })

  test('SQLite failure rolls back all entries, revision and receipt', () => {
    storage.mutate('board', 'anna', 'original', [set('value', 'before')])
    // Inject a failure on the second write, after the first UPDATE has run.
    const fault = new Database(path)
    fault.exec(`CREATE TRIGGER fail_insert BEFORE INSERT ON entries
      WHEN NEW.key = 'fail' BEGIN SELECT RAISE(ABORT, 'injected write failure'); END`)
    fault.close()
    expect(() =>
      storage.mutate('board', 'anna', 'broken', [set('value', 'after'), set('fail', true)])
    ).toThrow('injected write failure')
    expect(storage.snapshot('board')).toEqual({
      scope: 'board',
      revision: 1,
      entries: { value: 'before' }
    })
    expect(storage.lookupReceipts('anna', ['broken'])).toEqual([
      { operationId: 'broken', status: 'unknown' }
    ])
  })

  test('a delayed field edit cannot recreate deleted task membership', () => {
    storage.mutate('board', 'anna', 'create', [
      set('task/1/exists', true),
      set('task/1/title', 'Demo'),
      set('task/1/done', false)
    ])
    storage.mutate('board', 'anna', 'delete', [
      { type: 'delete', key: 'task/1/exists' },
      { type: 'delete', key: 'task/1/title' },
      { type: 'delete', key: 'task/1/done' }
    ])
    storage.mutate('board', 'boris', 'late', [set('task/1/title', 'Delayed edit')])
    expect(storage.snapshot('board').entries).toEqual({ 'task/1/title': 'Delayed edit' })
    storage.close()
    storage = openCollabStorage(path, { now: () => timestamp })
    expect(storage.snapshot('board').entries['task/1/exists']).toBeUndefined()
  })

  test('retrying a committed request does not overwrite a newer change or advance revision', () => {
    storage.mutate('board', 'anna', 'lost-ack', [set('title', 'A')])
    storage.mutate('board', 'boris', 'newer', [set('title', 'B')])
    expect(storage.mutate('board', 'anna', 'lost-ack', [set('title', 'A')])).toMatchObject({
      duplicate: true,
      revision: 1
    })
    expect(storage.snapshot('board')).toEqual({
      scope: 'board',
      revision: 2,
      entries: { title: 'B' }
    })
    expect(storage.lookupReceipts('anna', ['lost-ack'])).toEqual([
      { operationId: 'lost-ack', status: 'committed', scope: 'board', revision: 1 }
    ])
  })

  test('receipt fingerprints canonicalize JSON and reject changed scope or contents', () => {
    storage.mutate('board', 'anna', 'same-id', [set('data', { b: 2, a: 1 })])
    expect(
      storage.mutate('board', 'anna', 'same-id', [set('data', { a: 1, b: 2 })]).duplicate
    ).toBe(true)
    expect(() => storage.mutate('board', 'anna', 'same-id', [set('data', { a: 2 })])).toThrow(
      'Operation id was already used'
    )
    expect(() => storage.mutate('other', 'anna', 'same-id', [set('data', { a: 1, b: 2 })])).toThrow(
      'Operation id was already used'
    )
    expect(storage.snapshot('other').revision).toBe(0)
    expect(storage.lookupReceipts('boris', ['same-id'])).toEqual([
      { operationId: 'same-id', status: 'unknown' }
    ])
    expect(storage.mutate('board', 'boris', 'same-id', [set('other', true)]).duplicate).toBe(false)
  })

  test('data and retained receipts survive reopening the database', () => {
    storage.mutate('board', 'anna', 'saved', [set('data', { title: 'Demo', done: false })])
    storage.close()
    storage = openCollabStorage(path, { now: () => timestamp })
    expect(storage.lookupReceipts('anna', ['saved'])).toEqual([
      { operationId: 'saved', status: 'committed', scope: 'board', revision: 1 }
    ])
    expect(
      storage.mutate('board', 'anna', 'saved', [set('data', { done: false, title: 'Demo' })])
        .duplicate
    ).toBe(true)
    expect(storage.snapshot('board').revision).toBe(1)
  })

  test('expired or absent receipts are unknown and expiry never removes data', () => {
    storage.mutate('board', 'anna', 'old', [set('value', 'durable')])
    timestamp += COLLAB_STORAGE_LIMITS.receiptTtlMs - 1
    expect(storage.lookupReceipts('anna', ['old'])[0]?.status).toBe('committed')
    timestamp += 1
    expect(storage.lookupReceipts('anna', ['old', 'never-arrived'])).toEqual([
      { operationId: 'old', status: 'unknown' },
      { operationId: 'never-arrived', status: 'unknown' }
    ])
    storage.pruneReceipts()
    storage.close()
    storage = openCollabStorage(path, { now: () => timestamp })
    expect(storage.lookupReceipts('anna', ['old'])[0]?.status).toBe('unknown')
    expect(storage.snapshot('board').entries).toEqual({ value: 'durable' })
    const inspection = new Database(path, { readonly: true })
    expect(
      inspection.query<{ count: number }, []>('SELECT COUNT(*) AS count FROM receipts').get()?.count
    ).toBe(0)
    inspection.close()
  })

  test('live export is consistent, independently restorable and never overwrites a destination', () => {
    storage.mutate('board', 'anna', 'saved', [set('title', 'Before export')])
    const destination = join(directory, 'export', 'collab.sqlite')
    storage.exportTo(destination)
    storage.mutate('board', 'boris', 'later', [set('title', 'After export')])
    const restored = openCollabStorage(destination, { now: () => timestamp })
    try {
      expect(restored.snapshot('board')).toEqual({
        scope: 'board',
        revision: 1,
        entries: { title: 'Before export' }
      })
      expect(restored.lookupReceipts('anna', ['saved'])[0]?.status).toBe('committed')
      expect(restored.lookupReceipts('boris', ['later'])[0]?.status).toBe('unknown')
      expect(() => storage.exportTo(destination)).toThrow('already exists')
    } finally {
      restored.close()
    }
  })

  test('rejects non-JSON values, oversized payloads and excessive nesting before writing', () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    const invalid: unknown[] = [
      undefined,
      NaN,
      Infinity,
      new Date(),
      { missing: undefined },
      cyclic,
      [undefined]
    ]
    for (const value of invalid) {
      expect(() =>
        storage.mutate('board', 'anna', 'invalid', [set('bad', value as CollabJsonValue)])
      ).toThrow()
    }
    let nested: CollabJsonValue = null
    for (let i = 0; i < 40; i++) nested = [nested]
    expect(() => storage.mutate('board', 'anna', 'nested', [set('bad', nested)])).toThrow(
      'too complex'
    )
    expect(() => storage.mutate('board', 'anna', 'large', [set('bad', 'x'.repeat(65536))])).toThrow(
      '64 KiB'
    )
    expect(() =>
      storage.mutate(
        'board',
        'anna',
        'batch-large',
        Array.from({ length: 101 }, (_, i) => set(`${i}`, 1))
      )
    ).toThrow('100 operations')
    expect(() =>
      storage.mutate(
        'board',
        'anna',
        'request-large',
        Array.from({ length: 5 }, (_, i) => set(`${i}`, 'x'.repeat(60_000)))
      )
    ).toThrow('256 KiB')
    expect(() =>
      storage.mutate('board', 'anna', 'key-large', [set('x'.repeat(1025), true)])
    ).toThrow('Invalid shared key')
    expect(storage.snapshot('board')).toEqual({ scope: 'board', revision: 0, entries: {} })
  })

  test('scope capacity rejection rolls back earlier operations in the same batch', () => {
    const value = 'x'.repeat(65_000)
    for (let batch = 0; batch < 40; batch++) {
      storage.mutate(
        'board',
        'anna',
        `fill-${batch}`,
        Array.from({ length: 4 }, (_, i) => set(`fill/${batch * 4 + i}`, value))
      )
    }
    expect(() =>
      storage.mutate('board', 'anna', 'overflow', [
        set('marker', true),
        set('extra/1', value),
        set('extra/2', value)
      ])
    ).toThrow('storage limit')
    const snapshot = storage.snapshot('board')
    expect(snapshot.revision).toBe(40)
    expect(Object.keys(snapshot.entries)).toHaveLength(160)
    expect(snapshot.entries.marker).toBeUndefined()
    expect(storage.lookupReceipts('anna', ['overflow'])[0]?.status).toBe('unknown')
  })

  test('special object keys round-trip as data without prototype mutation', () => {
    const value = JSON.parse('{"__proto__":{"admin":true},"constructor":"data"}') as CollabJsonValue
    storage.mutate('board', 'anna', 'special', [set('__proto__', value)])
    const entries = storage.snapshot('board').entries
    expect(Object.hasOwn(entries, '__proto__')).toBe(true)
    expect(entries['__proto__']).toEqual(value)
    expect(Object.getPrototypeOf(entries)).toBe(Object.prototype)
  })

  test('uses versioned rollback-journal storage and refuses a newer schema', () => {
    storage.close()
    const inspection = new Database(path)
    expect(
      inspection.query<{ journal_mode: string }, []>('PRAGMA journal_mode').get()?.journal_mode
    ).toBe('delete')
    expect(
      inspection.query<{ user_version: number }, []>('PRAGMA user_version').get()?.user_version
    ).toBe(2)
    inspection.exec('PRAGMA user_version = 3')
    inspection.close()
    expect(() => openCollabStorage(path)).toThrow('newer version')
  })

  test('the people directory keeps the latest profile per person and survives reopening', () => {
    expect(storage.listPeople()).toEqual([])
    const ada = { id: 'ada', name: 'Ada', color: '#f59e0b' }
    const ken = { id: 'ken', name: 'Ken', color: '#3b82f6' }
    expect(storage.upsertPerson(ada)).toBe(true)
    expect(storage.upsertPerson(ada)).toBe(false)
    timestamp += 1000
    expect(storage.upsertPerson(ken)).toBe(true)
    timestamp += 1000
    const renamed = { ...ada, name: 'Ada L', avatar: 'data:image/png;base64,AAAA' }
    expect(storage.upsertPerson(renamed)).toBe(true)
    storage.close()
    storage = openCollabStorage(path, { now: () => timestamp })
    expect(storage.listPeople()).toEqual([renamed, ken])
    expect(() => storage.upsertPerson({ ...ada, avatar: 'x'.repeat(9000) })).toThrow('8 KiB')
    expect(storage.listPeople()).toEqual([renamed, ken])
  })

  test('a version 1 database gains the people directory and keeps its data', () => {
    const legacyPath = join(directory, 'legacy.sqlite')
    const legacy = new Database(legacyPath, { create: true })
    legacy.exec(`
      CREATE TABLE scopes (scope TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE entries (
        scope TEXT NOT NULL, key TEXT NOT NULL, value_json TEXT NOT NULL, PRIMARY KEY (scope, key)
      );
      CREATE TABLE receipts (
        actor_id TEXT NOT NULL, operation_id TEXT NOT NULL, request_hash TEXT NOT NULL,
        scope TEXT NOT NULL, revision INTEGER NOT NULL, committed_at INTEGER NOT NULL,
        PRIMARY KEY (actor_id, operation_id)
      );
      INSERT INTO scopes(scope, revision) VALUES ('shared:tasks', 3);
      INSERT INTO entries(scope, key, value_json) VALUES ('shared:tasks', 'task/1/title', '"Ship"');
      PRAGMA user_version = 1;
    `)
    legacy.close()
    const upgraded = openCollabStorage(legacyPath)
    try {
      expect(upgraded.snapshot('shared:tasks')).toEqual({
        scope: 'shared:tasks',
        revision: 3,
        entries: { 'task/1/title': 'Ship' }
      })
      expect(upgraded.listPeople()).toEqual([])
      expect(upgraded.upsertPerson({ id: 'ada', name: 'Ada', color: '#f59e0b' })).toBe(true)
    } finally {
      upgraded.close()
    }
  })
})
