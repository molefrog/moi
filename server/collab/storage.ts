import { Database } from 'bun:sqlite'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

import type {
  CollabJsonValue,
  CollabMutationResult,
  CollabOperation,
  CollabReceipt,
  CollabScopeSnapshot
} from '@/lib/collab/types'

export const COLLAB_STORAGE_LIMITS = {
  operations: 100,
  valueBytes: 64 * 1024,
  requestBytes: 256 * 1024,
  scopeBytes: 10 * 1024 * 1024,
  scopeEntries: 10_000,
  identifierBytes: 256,
  keyBytes: 1024,
  jsonDepth: 32,
  receiptTtlMs: 24 * 60 * 60 * 1000
} as const

const PRUNE_INTERVAL_MS = 60_000
const SCHEMA_VERSION = 1

export class CollabStorageError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message)
    this.name = 'CollabStorageError'
  }
}

export type CollabStorage = {
  snapshot: (scope: string) => CollabScopeSnapshot
  mutate: (
    scope: string,
    actorId: string,
    operationId: string,
    operations: readonly CollabOperation[]
  ) => CollabMutationResult
  lookupReceipts: (actorId: string, operationIds: readonly string[]) => CollabReceipt[]
  pruneReceipts: () => void
  exportTo: (path: string) => void
  close: () => void
}

export type CollabStorageOptions = {
  now?: () => number
}

function fail(code: string, message: string): never {
  throw new CollabStorageError(code, message)
}

function identifier(value: unknown, label: string, maxBytes: number) {
  if (
    typeof value !== 'string' ||
    !value.length ||
    value.includes('\0') ||
    Buffer.byteLength(value) > maxBytes
  ) {
    fail('INVALID_REQUEST', `Invalid ${label}`)
  }
}

// Canonical JSON gives equivalent objects the same fingerprint. Validate before
// encoding: JSON.stringify otherwise silently drops undefined and changes NaN.
function encodeJson(value: unknown): string {
  const ancestors = new Set<object>()
  let nodes = 0

  function encode(item: unknown, depth: number): string {
    if (++nodes > COLLAB_STORAGE_LIMITS.valueBytes || depth > COLLAB_STORAGE_LIMITS.jsonDepth) {
      return fail('LIMIT_EXCEEDED', 'Shared value is too complex')
    }
    if (item === null || typeof item === 'boolean' || typeof item === 'string') {
      return JSON.stringify(item)
    }
    if (typeof item === 'number' && Number.isFinite(item)) return JSON.stringify(item)
    if (typeof item !== 'object' || item === null) {
      return fail('INVALID_REQUEST', 'Shared values must contain only JSON data')
    }
    if (ancestors.has(item)) return fail('INVALID_REQUEST', 'Shared values cannot contain cycles')
    ancestors.add(item)
    let encoded: string
    if (Array.isArray(item)) {
      const parts: string[] = []
      for (let i = 0; i < item.length; i++) parts.push(encode(item[i], depth + 1))
      encoded = `[${parts.join(',')}]`
    } else {
      const prototype: unknown = Object.getPrototypeOf(item)
      if (prototype !== Object.prototype && prototype !== null) {
        return fail('INVALID_REQUEST', 'Shared values must contain only plain JSON objects')
      }
      if (Object.getOwnPropertySymbols(item).length) {
        return fail('INVALID_REQUEST', 'Shared values cannot contain symbol keys')
      }
      const parts: string[] = []
      for (const key of Object.keys(item).sort()) {
        const descriptor = Object.getOwnPropertyDescriptor(item, key)
        if (!descriptor || !('value' in descriptor)) {
          return fail('INVALID_REQUEST', 'Shared values cannot contain getters')
        }
        parts.push(`${JSON.stringify(key)}:${encode(descriptor.value, depth + 1)}`)
      }
      encoded = `{${parts.join(',')}}`
    }
    ancestors.delete(item)
    if (Buffer.byteLength(encoded) > COLLAB_STORAGE_LIMITS.valueBytes) {
      return fail('LIMIT_EXCEEDED', 'Shared value exceeds 64 KiB')
    }
    return encoded
  }

  const result = encode(value, 0)
  if (Buffer.byteLength(result) > COLLAB_STORAGE_LIMITS.valueBytes) {
    fail('LIMIT_EXCEEDED', 'Shared value exceeds 64 KiB')
  }
  return result
}

function normalizeOperations(operations: readonly CollabOperation[]): CollabOperation[] {
  if (!Array.isArray(operations) || operations.length > COLLAB_STORAGE_LIMITS.operations) {
    return fail('LIMIT_EXCEEDED', 'A shared mutation accepts at most 100 operations')
  }
  return operations.map(operation => {
    if (!operation || typeof operation !== 'object') {
      return fail('INVALID_REQUEST', 'Invalid shared operation')
    }
    identifier(operation.key, 'shared key', COLLAB_STORAGE_LIMITS.keyBytes)
    if (operation.type === 'delete') return { type: 'delete', key: operation.key }
    if (operation.type !== 'set') return fail('INVALID_REQUEST', 'Unknown shared operation')
    return {
      type: 'set',
      key: operation.key,
      value: JSON.parse(encodeJson(operation.value)) as CollabJsonValue
    }
  })
}

export function openCollabStorage(path: string, options: CollabStorageOptions = {}): CollabStorage {
  const now = options.now ?? Date.now
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const db = new Database(path, { create: true, strict: true })
  try {
    db.exec('PRAGMA journal_mode = DELETE; PRAGMA synchronous = EXTRA')
    const version = db
      .query<{ user_version: number }, []>('PRAGMA user_version')
      .get()!.user_version
    if (version > SCHEMA_VERSION) {
      fail('SCHEMA_VERSION', 'Shared storage was created by a newer version of moi')
    }
    if (version === 0) {
      db.transaction(() => {
        db.exec(`
          CREATE TABLE scopes (
            scope TEXT PRIMARY KEY,
            revision INTEGER NOT NULL DEFAULT 0
          );
          CREATE TABLE entries (
            scope TEXT NOT NULL,
            key TEXT NOT NULL,
            value_json TEXT NOT NULL,
            PRIMARY KEY (scope, key)
          );
          CREATE TABLE receipts (
            actor_id TEXT NOT NULL,
            operation_id TEXT NOT NULL,
            request_hash TEXT NOT NULL,
            scope TEXT NOT NULL,
            revision INTEGER NOT NULL,
            committed_at INTEGER NOT NULL,
            PRIMARY KEY (actor_id, operation_id)
          );
          CREATE INDEX receipts_expiry ON receipts(committed_at);
          PRAGMA user_version = 1;
        `)
      })()
    }
  } catch (error) {
    db.close()
    throw error
  }

  const scopeRevision = db.query<{ revision: number }, [string]>(
    'SELECT revision FROM scopes WHERE scope = ?'
  )
  const scopeEntries = db.query<{ key: string; value_json: string }, [string]>(
    'SELECT key, value_json FROM entries WHERE scope = ? ORDER BY key'
  )
  const receipt = db.query<
    { request_hash: string; scope: string; revision: number },
    [string, string, number]
  >(`SELECT request_hash, scope, revision FROM receipts
     WHERE actor_id = ? AND operation_id = ? AND committed_at > ?`)
  const insertScope = db.query('INSERT INTO scopes(scope) VALUES (?) ON CONFLICT DO NOTHING')
  const advanceRevision = db.query<{ revision: number }, [string]>(
    'UPDATE scopes SET revision = revision + 1 WHERE scope = ? RETURNING revision'
  )
  const setEntry = db.query(`INSERT INTO entries(scope, key, value_json) VALUES (?, ?, ?)
    ON CONFLICT(scope, key) DO UPDATE SET value_json = excluded.value_json`)
  const deleteEntry = db.query('DELETE FROM entries WHERE scope = ? AND key = ?')
  const size = db.query<{ bytes: number; count: number }, [string]>(
    `SELECT COALESCE(SUM(length(CAST(key AS BLOB)) + length(CAST(value_json AS BLOB))), 0) AS bytes,
     COUNT(*) AS count FROM entries WHERE scope = ?`
  )
  const insertReceipt = db.query(`INSERT INTO receipts
    (actor_id, operation_id, request_hash, scope, revision, committed_at) VALUES (?, ?, ?, ?, ?, ?)`)
  const deleteExpired = db.query('DELETE FROM receipts WHERE committed_at <= ?')
  let closed = false

  function pruneReceipts() {
    if (!closed) deleteExpired.run(now() - COLLAB_STORAGE_LIMITS.receiptTtlMs)
  }
  pruneReceipts()
  const pruneTimer = setInterval(pruneReceipts, PRUNE_INTERVAL_MS)
  pruneTimer.unref()

  const commit = db.transaction(
    (
      scope: string,
      actorId: string,
      operationId: string,
      operations: CollabOperation[],
      fingerprint: string,
      timestamp: number
    ): CollabMutationResult => {
      const previous = receipt.get(
        actorId,
        operationId,
        timestamp - COLLAB_STORAGE_LIMITS.receiptTtlMs
      )
      if (previous) {
        if (previous.request_hash !== fingerprint) {
          return fail(
            'OPERATION_CONFLICT',
            'Operation id was already used for a different mutation'
          )
        }
        return { scope, operationId, operations, revision: previous.revision, duplicate: true }
      }
      // Expired ids are outside the retry contract. Remove an expired receipt
      // before inserting; clients must give deliberate new edits new ids.
      db.query('DELETE FROM receipts WHERE actor_id = ? AND operation_id = ?').run(
        actorId,
        operationId
      )
      insertScope.run(scope)
      const revision = advanceRevision.get(scope)!.revision
      for (const operation of operations) {
        if (operation.type === 'set') {
          setEntry.run(scope, operation.key, JSON.stringify(operation.value))
        } else {
          deleteEntry.run(scope, operation.key)
        }
      }
      const totals = size.get(scope)!
      if (
        totals.bytes > COLLAB_STORAGE_LIMITS.scopeBytes ||
        totals.count > COLLAB_STORAGE_LIMITS.scopeEntries
      ) {
        return fail('LIMIT_EXCEEDED', 'Shared scope exceeds its storage limit')
      }
      insertReceipt.run(actorId, operationId, fingerprint, scope, revision, timestamp)
      return { scope, operationId, revision, operations, duplicate: false }
    }
  )

  return {
    snapshot(scope) {
      identifier(scope, 'scope', COLLAB_STORAGE_LIMITS.identifierBytes)
      return {
        scope,
        revision: scopeRevision.get(scope)?.revision ?? 0,
        entries: Object.fromEntries(
          scopeEntries
            .all(scope)
            .map(row => [row.key, JSON.parse(row.value_json) as CollabJsonValue])
        )
      }
    },
    mutate(scope, actorId, operationId, input) {
      identifier(scope, 'scope', COLLAB_STORAGE_LIMITS.identifierBytes)
      identifier(actorId, 'actor id', COLLAB_STORAGE_LIMITS.identifierBytes)
      identifier(operationId, 'operation id', COLLAB_STORAGE_LIMITS.identifierBytes)
      const operations = normalizeOperations(input)
      const encoded = JSON.stringify({ scope, operations })
      if (Buffer.byteLength(encoded) > COLLAB_STORAGE_LIMITS.requestBytes) {
        return fail('LIMIT_EXCEEDED', 'Shared mutation exceeds 256 KiB')
      }
      const fingerprint = new Bun.CryptoHasher('sha256').update(encoded).digest('hex')
      return commit(scope, actorId, operationId, operations, fingerprint, now())
    },
    lookupReceipts(actorId, operationIds) {
      identifier(actorId, 'actor id', COLLAB_STORAGE_LIMITS.identifierBytes)
      if (!Array.isArray(operationIds) || operationIds.length > COLLAB_STORAGE_LIMITS.operations) {
        return fail('LIMIT_EXCEEDED', 'Look up at most 100 operations at once')
      }
      const cutoff = now() - COLLAB_STORAGE_LIMITS.receiptTtlMs
      return operationIds.map(operationId => {
        identifier(operationId, 'operation id', COLLAB_STORAGE_LIMITS.identifierBytes)
        const found = receipt.get(actorId, operationId, cutoff)
        return found
          ? { operationId, status: 'committed', scope: found.scope, revision: found.revision }
          : { operationId, status: 'unknown' }
      })
    },
    pruneReceipts,
    exportTo(destination) {
      if (existsSync(destination)) fail('EXPORT_EXISTS', 'Shared storage export already exists')
      mkdirSync(dirname(destination), { recursive: true })
      pruneReceipts()
      db.query('VACUUM INTO ?').run(destination)
    },
    close() {
      if (closed) return
      closed = true
      clearInterval(pruneTimer)
      db.close()
    }
  }
}
