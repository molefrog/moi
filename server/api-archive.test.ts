import { afterEach, beforeEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { api } from './api'
import { claudeCodeHarness } from './harness/claude-code'
import { codexHarness } from './harness/codex'
import { openclawHarness } from './harness/openclaw'
import { DEFAULT_REGISTRY_PATH, registerWorkspace, setRegistryPath } from './registry'
import {
  DEFAULT_SELECTED_SESSION_PATH,
  getSelectedSession,
  saveSelectedSession,
  setSelectedSessionPath
} from './selected-session'
import { silenceConsole } from './test/quiet'

// One test makes `archiveSession` throw; the route logs that error on purpose.
silenceConsole('error')

let tempDir: string
const originalClaudeInterrupt = claudeCodeHarness.interrupt
const originalClaudeArchive = claudeCodeHarness.archiveSession
const originalClaudeListModels = claudeCodeHarness.listModels
const originalCodexListModels = codexHarness.listModels
const originalOpenclawInterrupt = openclawHarness.interrupt
const originalOpenclawArchive = openclawHarness.archiveSession

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'moi-api-archive-'))
  setRegistryPath(join(tempDir, 'workspaces.json'))
  setSelectedSessionPath(join(tempDir, 'selected-sessions.json'))
})

afterEach(async () => {
  claudeCodeHarness.interrupt = originalClaudeInterrupt
  claudeCodeHarness.archiveSession = originalClaudeArchive
  claudeCodeHarness.listModels = originalClaudeListModels
  codexHarness.listModels = originalCodexListModels
  openclawHarness.interrupt = originalOpenclawInterrupt
  openclawHarness.archiveSession = originalOpenclawArchive
  setRegistryPath(DEFAULT_REGISTRY_PATH)
  setSelectedSessionPath(DEFAULT_SELECTED_SESSION_PATH)
  await rm(tempDir, { recursive: true, force: true })
})

test('each archive stops its chat before archiving and requests can overlap', async () => {
  const workspace = await registerWorkspace(join(tempDir, 'claude'), { type: 'claude-code' })
  const calls: string[] = []
  let releaseFirst: (() => void) | undefined
  const firstStopped = new Promise<void>(resolve => {
    releaseFirst = resolve
  })

  claudeCodeHarness.interrupt = async (_, sessionId) => {
    calls.push(`stop:${sessionId}`)
    if (sessionId === 'first') await firstStopped
  }
  claudeCodeHarness.archiveSession = async (_, sessionId) => {
    calls.push(`archive:${sessionId}`)
  }

  const firstRequest = api.request(`/api/workspaces/${workspace.id}/sessions/first/archive`, {
    method: 'POST'
  })
  await Promise.resolve()
  const secondResponse = await api.request(
    `/api/workspaces/${workspace.id}/sessions/second/archive`,
    { method: 'POST' }
  )

  expect(secondResponse.status).toBe(204)
  expect(calls).toContain('stop:first')
  expect(calls).toEqual(expect.arrayContaining(['stop:second', 'archive:second']))
  expect(calls.indexOf('stop:second')).toBeLessThan(calls.indexOf('archive:second'))
  expect(calls).not.toContain('archive:first')

  releaseFirst?.()
  expect((await firstRequest).status).toBe(204)
  expect(calls.indexOf('stop:first')).toBeLessThan(calls.indexOf('archive:first'))
})

test('one archive failure does not block another chat', async () => {
  const workspace = await registerWorkspace(join(tempDir, 'claude'), { type: 'claude-code' })
  claudeCodeHarness.interrupt = async () => {}
  claudeCodeHarness.archiveSession = async (_, sessionId) => {
    if (sessionId === 'failed') throw new Error('archive failed')
  }

  const [failed, succeeded] = await Promise.all([
    api.request(`/api/workspaces/${workspace.id}/sessions/failed/archive`, { method: 'POST' }),
    api.request(`/api/workspaces/${workspace.id}/sessions/succeeded/archive`, { method: 'POST' })
  ])

  expect(failed.status).toBe(500)
  // Harness error messages pass through so backend refusals stay actionable.
  expect(await failed.text()).toBe('archive failed')
  expect(succeeded.status).toBe(204)
})

test('archiving the selected session switches the workspace to New chat', async () => {
  const workspace = await registerWorkspace(join(tempDir, 'claude'), { type: 'claude-code' })
  await saveSelectedSession(workspace.path, 'selected')
  claudeCodeHarness.interrupt = async () => {}
  claudeCodeHarness.archiveSession = async () => {}

  const response = await api.request(`/api/workspaces/${workspace.id}/sessions/selected/archive`, {
    method: 'POST'
  })

  expect(response.status).toBe(204)
  expect(await getSelectedSession(workspace.path)).toBeNull()
})

test('every provider supports archiving, openclaw via gateway patch', async () => {
  const claude = await registerWorkspace(join(tempDir, 'claude'), { type: 'claude-code' })
  const codex = await registerWorkspace(join(tempDir, 'codex'), { type: 'codex' })
  const openclaw = await registerWorkspace(join(tempDir, 'openclaw'), { type: 'openclaw' })
  claudeCodeHarness.listModels = async () => []
  codexHarness.listModels = async () => []
  const archived: string[] = []
  openclawHarness.interrupt = async () => {}
  openclawHarness.archiveSession = async (_, sessionId) => {
    archived.push(sessionId)
  }

  const [claudeModels, codexModels, openclawArchive] = await Promise.all([
    api.request(`/api/workspaces/${claude.id}/models`),
    api.request(`/api/workspaces/${codex.id}/models`),
    api.request(`/api/workspaces/${openclaw.id}/sessions/chat/archive`, { method: 'POST' })
  ])

  expect((await claudeModels.json()).supportsArchiving).toBe(true)
  expect((await codexModels.json()).supportsArchiving).toBe(true)
  expect(openclawArchive.status).toBe(204)
  expect(archived).toEqual(['chat'])
})
