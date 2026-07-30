import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  getThreadConfig,
  renameThreadConfig,
  saveThreadConfig,
  setThreadConfigPath
} from './thread-config'

let scratchDir = ''
const workspacePath = '/workspace'

beforeEach(async () => {
  scratchDir = await mkdtemp(join(tmpdir(), 'moi-thread-config-'))
  setThreadConfigPath(join(scratchDir, 'thread-config.json'))
})

afterEach(async () => {
  await rm(scratchDir, { recursive: true, force: true })
})

describe('thread Fast mode config', () => {
  test('preserves explicit false and clears only when asked', async () => {
    await saveThreadConfig(workspacePath, 'thread-1', {
      model: 'sonnet',
      fastMode: false
    })
    expect(await getThreadConfig(workspacePath, 'thread-1')).toEqual({
      model: 'sonnet',
      fastMode: false
    })

    await saveThreadConfig(workspacePath, 'thread-1', { fastMode: null })
    expect(await getThreadConfig(workspacePath, 'thread-1')).toEqual({ model: 'sonnet' })
  })

  test('keeps false when a temporary thread config is renamed', async () => {
    await saveThreadConfig(workspacePath, 'temporary', { fastMode: false })
    await renameThreadConfig(workspacePath, 'temporary', 'real')

    expect(await getThreadConfig(workspacePath, 'temporary')).toEqual({})
    expect(await getThreadConfig(workspacePath, 'real')).toEqual({ fastMode: false })
  })
})
