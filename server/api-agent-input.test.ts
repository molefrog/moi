import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { api } from './api'
import { codexHarness } from './harness/codex'
import { DEFAULT_REGISTRY_PATH, registerWorkspace, setRegistryPath } from './registry'

let tempDir = ''
let answer: ReturnType<typeof spyOn<typeof codexHarness, 'answerInput'>>

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'moi-api-agent-input-'))
  setRegistryPath(join(tempDir, 'workspaces.json'))
  answer = spyOn(codexHarness, 'answerInput').mockImplementation(() => {})
})

afterEach(async () => {
  answer.mockRestore()
  setRegistryPath(DEFAULT_REGISTRY_PATH)
  await rm(tempDir, { recursive: true, force: true })
})

test('routes answers to exactly the workspace and session in the URL', async () => {
  const ws = await registerWorkspace(join(tempDir, 'workspace'), { type: 'codex' })
  const response = await api.request(`/api/workspaces/${ws.id}/sessions/session-one/input`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestId: 'question', answers: { color: 'Green' } })
  })
  expect(response.status).toBe(204)
  expect(answer).toHaveBeenCalledWith(
    expect.objectContaining({ id: ws.id, path: ws.path, type: 'codex' }),
    'session-one',
    'question',
    { color: 'Green' }
  )
})

test('malformed input never reaches the provider and stale questions return a conflict', async () => {
  const ws = await registerWorkspace(join(tempDir, 'workspace'), { type: 'codex' })
  const url = `/api/workspaces/${ws.id}/sessions/session-one/input`
  for (const body of ['{', 'null', '[]', '{"requestId":"question"}']) {
    const response = await api.request(url, { method: 'POST', body })
    expect(response.status).toBe(400)
  }
  expect(answer).not.toHaveBeenCalled()
  answer.mockImplementation(() => {
    throw new Error('This question is no longer waiting for an answer')
  })
  const stale = await api.request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestId: 'question', answers: null })
  })
  expect(stale.status).toBe(409)
  expect(await stale.text()).toContain('no longer waiting')
})
