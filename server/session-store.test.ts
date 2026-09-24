import { afterEach, beforeEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  DEFAULT_SESSION_STORE_PATH,
  setSessionStorePath,
  renameSessionRecord,
  clearSessionRecordTab
} from './session-store'
import { getSessionConfig, saveSessionConfig } from './session-config'
import { getSessionRecord, patchSessionRecord, withSessionRecords } from './session-store'

let directory: string
let path: string
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'moi-session-store-'))
  path = join(directory, 'sessions.json')
  setSessionStorePath(path)
})
afterEach(async () => {
  setSessionStorePath(DEFAULT_SESSION_STORE_PATH)
  await rm(directory, { recursive: true, force: true })
})

test('concurrent config and metadata updates share a record without leaking config into metadata', async () => {
  await Promise.all([
    saveSessionConfig('/ws', 's1', { model: 'sonnet', fastMode: false }),
    patchSessionRecord('/ws', 's1', { tabId: 'scratchpad' })
  ])
  expect(await Bun.file(path).json()).toEqual({
    '/ws': { s1: { config: { model: 'sonnet', fastMode: false }, tabId: 'scratchpad' } }
  })
  expect(await getSessionRecord('/ws', 's1')).toEqual({
    config: { model: 'sonnet', fastMode: false },
    tabId: 'scratchpad'
  })
  expect(
    await withSessionRecords('/ws', [{ sessionId: 's1', summary: '', lastModified: 0 }])
  ).toEqual([{ sessionId: 's1', summary: '', lastModified: 0, tabId: 'scratchpad' }])
  await saveSessionConfig('/ws', 's1', { model: null, fastMode: null })
  expect(await getSessionConfig('/ws', 's1')).toEqual({})
  expect(await getSessionRecord('/ws', 's1')).toEqual({ tabId: 'scratchpad' })
})

test('renaming a session moves the whole record and preserves destination config overrides', async () => {
  await saveSessionConfig('/ws', 'temporary', { model: 'sonnet', effort: 'high' })
  await patchSessionRecord('/ws', 'temporary', { tabId: 'scratchpad' })
  await saveSessionConfig('/ws', 'native', { model: 'opus' })
  await renameSessionRecord('/ws', 'temporary', 'native')
  expect(await getSessionConfig('/ws', 'native')).toEqual({ model: 'opus', effort: 'high' })
  expect(await getSessionRecord('/ws', 'native')).toEqual({
    config: { model: 'opus', effort: 'high' },
    tabId: 'scratchpad'
  })
  expect((await Bun.file(path).json())['/ws'].temporary).toBeUndefined()
})

test('imports legacy files once and never resurrects cleared settings', async () => {
  const legacyConfig = { '/ws': { s1: { fastMode: false } } }
  await Bun.write(join(directory, 'session-config.json'), JSON.stringify(legacyConfig))
  expect(await getSessionConfig('/ws', 's1')).toEqual({ fastMode: false })
  await saveSessionConfig('/ws', 's1', { fastMode: null })
  expect(await getSessionConfig('/ws', 's1')).toEqual({})
  expect(await Bun.file(join(directory, 'session-config.json')).json()).toEqual(legacyConfig)
})

test('deleted views clear attribution while preserving fork provenance', async () => {
  const provenance = {
    forkedFromSessionId: 'parent',
    forkedThroughMessageId: 'boundary'
  }
  await patchSessionRecord('/ws', 'child', { tabId: 'views/words', ...provenance })
  await clearSessionRecordTab('/ws', 'views/words')
  expect(await getSessionRecord('/ws', 'child')).toEqual(provenance)
})

test('session renames move metadata and fork source ids without changing the boundary', async () => {
  const provenance = {
    forkedFromSessionId: 'temp-parent',
    forkedThroughMessageId: 'boundary'
  }
  await patchSessionRecord('/ws', 'temp-child', { tabId: 'scratchpad', ...provenance })
  await renameSessionRecord('/ws', 'temp-child', 'child')
  await renameSessionRecord('/ws', 'temp-parent', 'parent')
  expect(await getSessionRecord('/ws', 'temp-child')).toEqual({})
  const sessions = await withSessionRecords('/ws', [
    { sessionId: 'child', summary: 'Title', lastModified: 1 }
  ])
  expect(sessions[0].tabId).toBe('scratchpad')
  expect(sessions[0]).toMatchObject({ ...provenance, forkedFromSessionId: 'parent' })
})

test('refuses to overwrite malformed stored data', async () => {
  await Bun.write(path, '{broken')
  await expect(saveSessionConfig('/ws', 's1', { model: 'sonnet' })).rejects.toThrow()
  expect(await Bun.file(path).text()).toBe('{broken')
})
