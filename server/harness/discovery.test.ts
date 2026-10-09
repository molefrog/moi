import { afterEach, beforeEach, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { discoveryEntries } from './discovery'

let root: string
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'moi-discovery-entries-'))
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

test('caps directory enumeration even when every entry is a directory', async () => {
  for (let i = 0; i < 200; i++) await mkdir(join(root, String(i)))
  const entries = []
  for await (const entry of discoveryEntries(root, 3, Infinity)) entries.push(entry)
  expect(entries).toHaveLength(3)
})

test('missing directories produce an empty result', async () => {
  const entries = []
  for await (const entry of discoveryEntries(join(root, 'missing'), 3, Infinity))
    entries.push(entry)
  expect(entries).toEqual([])
})
