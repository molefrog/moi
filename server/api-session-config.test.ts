import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { api } from './api'
import { fxHarness } from './harness/fx'
import { DEFAULT_REGISTRY_PATH, registerWorkspace, setRegistryPath } from './registry'
import {
  DEFAULT_SESSION_CONFIG_PATH,
  getSessionConfig,
  saveSessionConfig,
  setSessionConfigPath
} from './session-config'

let dir = ''
const originalSessionConfig = fxHarness.sessionConfig
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'moi-api-session-config-'))
  setRegistryPath(join(dir, 'registry.json'))
  setSessionConfigPath(join(dir, 'session-config.json'))
})
afterEach(async () => {
  fxHarness.sessionConfig = originalSessionConfig
  setRegistryPath(DEFAULT_REGISTRY_PATH)
  setSessionConfigPath(DEFAULT_SESSION_CONFIG_PATH)
  await rm(dir, { recursive: true, force: true })
})

describe('effective session settings API', () => {
  test('native settings remain per chat and are not written as moi overrides', async () => {
    const ws = await registerWorkspace(join(dir, 'workspace'), { type: 'fx' })
    fxHarness.sessionConfig = async (_ws, id) =>
      id === 'native-high' ? { model: 'glm', effort: 'high' } : { model: 'luna', effort: 'auto' }
    const first = await api.request(`/api/workspaces/${ws.id}/sessions/native-high/config`)
    const second = await api.request(`/api/workspaces/${ws.id}/sessions/native-auto/config`)
    expect(await first.json()).toEqual({ model: 'glm', effort: 'high' })
    expect(await second.json()).toEqual({ model: 'luna', effort: 'auto' })
    expect(await getSessionConfig(ws.path, 'native-high')).toEqual({})
    expect(await getSessionConfig(ws.path, 'native-auto')).toEqual({})
  })

  test('an effort-only override keeps the native model, and clearing restores reported auto', async () => {
    const ws = await registerWorkspace(join(dir, 'workspace'), { type: 'fx' })
    fxHarness.sessionConfig = async () => ({ model: 'glm', effort: 'auto' })
    const url = `/api/workspaces/${ws.id}/sessions/native/config`
    const update = (body: unknown) =>
      api.request(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
    expect(await (await update({ effort: 'high' })).json()).toEqual({
      model: 'glm',
      effort: 'high'
    })
    expect(await getSessionConfig(ws.path, 'native')).toEqual({ effort: 'high' })
    expect(await (await update({ effort: null })).json()).toEqual({ model: 'glm', effort: 'auto' })
    expect(await getSessionConfig(ws.path, 'native')).toEqual({})
  })

  test('a pending model pick does not inherit another model’s native effort', async () => {
    const ws = await registerWorkspace(join(dir, 'workspace'), { type: 'fx' })
    fxHarness.sessionConfig = async () => ({ model: 'glm', effort: 'high' })
    await saveSessionConfig(ws.path, 'native', { model: 'luna', fastMode: false })
    const url = `/api/workspaces/${ws.id}/sessions/native/config`
    expect(await (await api.request(url)).json()).toEqual({ model: 'luna', fastMode: false })
    await saveSessionConfig(ws.path, 'native', { effort: 'auto' })
    expect(await (await api.request(url)).json()).toEqual({
      model: 'luna',
      effort: 'auto',
      fastMode: false
    })
  })

  test('a choice saved while native settings load wins over the response', async () => {
    const ws = await registerWorkspace(join(dir, 'workspace'), { type: 'fx' })
    const loading = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    fxHarness.sessionConfig = async () => {
      loading.resolve()
      await release.promise
      return { model: 'glm', effort: 'high' }
    }
    const request = api.request(`/api/workspaces/${ws.id}/sessions/native/config`)
    await loading.promise
    await saveSessionConfig(ws.path, 'native', { effort: 'auto' })
    release.resolve()
    expect(await (await request).json()).toEqual({ model: 'glm', effort: 'auto' })
  })

  test('a native load failure is an error and does not create moi settings', async () => {
    const ws = await registerWorkspace(join(dir, 'workspace'), { type: 'fx' })
    fxHarness.sessionConfig = async () => {
      throw new Error('Native chat unavailable')
    }
    const response = await api.request(`/api/workspaces/${ws.id}/sessions/missing/config`)
    expect(response.status).toBe(500)
    expect(await response.text()).toBe('Native chat unavailable')
    expect(await getSessionConfig(ws.path, 'missing')).toEqual({})
  })

  test('choices for a temporary id can be saved before the backend creates it', async () => {
    const ws = await registerWorkspace(join(dir, 'workspace'), { type: 'fx' })
    fxHarness.sessionConfig = async () => {
      throw new Error('Unknown session')
    }
    const response = await api.request(`/api/workspaces/${ws.id}/sessions/temporary/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ effort: 'high' })
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ effort: 'high' })
    expect(await getSessionConfig(ws.path, 'temporary')).toEqual({ effort: 'high' })
  })

  test('providers without native settings retain stored-only behavior', async () => {
    const ws = await registerWorkspace(join(dir, 'workspace'), { type: 'claude-code' })
    await saveSessionConfig(ws.path, 'existing', { model: 'sonnet', effort: 'high' })
    expect(
      await (await api.request(`/api/workspaces/${ws.id}/sessions/existing/config`)).json()
    ).toEqual({ model: 'sonnet', effort: 'high' })
    expect(
      await (await api.request(`/api/workspaces/${ws.id}/sessions/new/config`)).json()
    ).toEqual({})
  })
})
