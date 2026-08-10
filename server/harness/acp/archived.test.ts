import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  archiveAcpSession,
  archivedAcpSessions,
  setArchivedSessionsPath,
  unarchiveAcpSession
} from './archived'

let dir: string
const WS = '/ws/alpha'
const OTHER = '/ws/beta'

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'acp-archived-'))
  setArchivedSessionsPath(join(dir, 'acp-archived-sessions.json'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('archivedAcpSessions', () => {
  test('is empty before anything is archived', async () => {
    expect(await archivedAcpSessions(WS)).toEqual(new Set())
  })

  test('survives a missing or corrupt store file', async () => {
    setArchivedSessionsPath(join(dir, 'nested', 'missing.json'))
    expect(await archivedAcpSessions(WS)).toEqual(new Set())

    const broken = join(dir, 'broken.json')
    await Bun.write(broken, 'not json')
    setArchivedSessionsPath(broken)
    expect(await archivedAcpSessions(WS)).toEqual(new Set())
  })
})

describe('archiveAcpSession', () => {
  test('records a session and reads it back', async () => {
    await archiveAcpSession(WS, 's1')
    expect(await archivedAcpSessions(WS)).toEqual(new Set(['s1']))
  })

  test('is idempotent', async () => {
    await archiveAcpSession(WS, 's1')
    await archiveAcpSession(WS, 's1')
    expect([...(await archivedAcpSessions(WS))]).toEqual(['s1'])
  })

  // Workspaces share one store file, so they must not leak into each other.
  test('scopes by workspace path', async () => {
    await archiveAcpSession(WS, 's1')
    await archiveAcpSession(OTHER, 's2')

    expect(await archivedAcpSessions(WS)).toEqual(new Set(['s1']))
    expect(await archivedAcpSessions(OTHER)).toEqual(new Set(['s2']))
  })

  test('ignores an empty session id', async () => {
    await archiveAcpSession(WS, '')
    expect(await archivedAcpSessions(WS)).toEqual(new Set())
  })

  // Concurrent archives go through one write chain; without it the last writer
  // would drop the others' entries.
  test('keeps every id when archived concurrently', async () => {
    await Promise.all(['a', 'b', 'c', 'd'].map(id => archiveAcpSession(WS, id)))
    expect(await archivedAcpSessions(WS)).toEqual(new Set(['a', 'b', 'c', 'd']))
  })
})

describe('unarchiveAcpSession', () => {
  test('removes one id and leaves the rest', async () => {
    await archiveAcpSession(WS, 's1')
    await archiveAcpSession(WS, 's2')
    await unarchiveAcpSession(WS, 's1')

    expect(await archivedAcpSessions(WS)).toEqual(new Set(['s2']))
  })

  test('drops the workspace entry once it empties', async () => {
    await archiveAcpSession(WS, 's1')
    await unarchiveAcpSession(WS, 's1')

    const raw = JSON.parse(await Bun.file(join(dir, 'acp-archived-sessions.json')).text())
    expect(raw).toEqual({})
  })

  test('is a no-op for an id that was never archived', async () => {
    await archiveAcpSession(WS, 's1')
    await unarchiveAcpSession(WS, 'nope')
    expect(await archivedAcpSessions(WS)).toEqual(new Set(['s1']))
  })
})
