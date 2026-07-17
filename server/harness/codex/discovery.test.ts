import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { discoverCodexWorkspaces } from './discovery'

let root: string // fake ~/.codex/sessions
let workDirs: string // real directories the fake sessions point at

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'codex-sessions-'))
  workDirs = await mkdtemp(join(tmpdir(), 'codex-cwds-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
  await rm(workDirs, { recursive: true, force: true })
})

async function writeRollout(relPath: string, firstLine: string, extraLines: string[] = []) {
  const file = join(root, relPath)
  await mkdir(join(file, '..'), { recursive: true })
  await Bun.write(file, [firstLine, ...extraLines, ''].join('\n'))
}

function sessionMeta(cwd: string, timestamp?: string): string {
  return JSON.stringify({
    timestamp,
    type: 'session_meta',
    payload: { id: crypto.randomUUID(), timestamp, cwd, originator: 'codex_cli_rs' }
  })
}

describe('discoverCodexWorkspaces', () => {
  test('finds cwds from rollout session_meta lines, newest run first per cwd', async () => {
    const projectA = join(workDirs, 'a')
    await mkdir(projectA)
    await writeRollout(
      '2026/07/01/rollout-2026-07-01T10-00-00-aaa.jsonl',
      sessionMeta(projectA, '2026-07-01T10:00:00Z'),
      ['{"type":"turn_context"}']
    )
    await writeRollout(
      '2026/07/15/rollout-2026-07-15T09-30-00-bbb.jsonl',
      sessionMeta(projectA, '2026-07-15T09:30:00Z')
    )

    const found = await discoverCodexWorkspaces(new Set(), root)
    expect(found).toEqual([{ path: projectA, type: 'codex', lastRunAt: '2026-07-15T09:30:00Z' }])
  })

  test('skips registered paths and cwds that no longer exist', async () => {
    const registered = join(workDirs, 'registered')
    const fresh = join(workDirs, 'fresh')
    await mkdir(registered)
    await mkdir(fresh)
    await writeRollout('2026/07/10/rollout-1.jsonl', sessionMeta(registered))
    await writeRollout('2026/07/10/rollout-2.jsonl', sessionMeta(fresh))
    await writeRollout('2026/07/10/rollout-3.jsonl', sessionMeta(join(workDirs, 'deleted')))

    const found = await discoverCodexWorkspaces(new Set([registered]), root)
    expect(found.map(w => w.path)).toEqual([fresh])
  })

  test('reads a flat (payload-less) meta line and ignores malformed files', async () => {
    const flat = join(workDirs, 'flat')
    await mkdir(flat)
    await writeRollout('2026/06/01/rollout-flat.jsonl', JSON.stringify({ cwd: flat }))
    await writeRollout('2026/06/01/rollout-junk.jsonl', 'not json at all')
    await writeRollout('2026/06/01/rollout-nocwd.jsonl', JSON.stringify({ type: 'session_meta' }))

    const found = await discoverCodexWorkspaces(new Set(), root)
    expect(found).toEqual([{ path: flat, type: 'codex' }])
  })

  test('returns nothing when the sessions dir does not exist', async () => {
    expect(await discoverCodexWorkspaces(new Set(), join(root, 'missing'))).toEqual([])
  })
})
