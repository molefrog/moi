import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { AppSettings } from '@/lib/types'

import { api } from './api'
import { setAppSettingsDir } from './app-settings'
import { DATA_DIR } from './data-dir'

let tempDir = ''

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'moi-app-settings-'))
  setAppSettingsDir(tempDir)
})

afterEach(async () => {
  setAppSettingsDir(DATA_DIR)
  await rm(tempDir, { recursive: true, force: true })
  tempDir = ''
})

describe('app settings API', () => {
  test('returns defaults before anything is saved', async () => {
    const response = await api.request('/api/settings')
    const settings = (await response.json()) as AppSettings

    expect(response.status).toBe(200)
    expect(settings).toEqual({ autoUpdateSkills: false })
  })

  test('persists a patched setting to settings.json', async () => {
    const response = await api.request('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ autoUpdateSkills: true })
    })
    const settings = (await response.json()) as AppSettings

    expect(response.status).toBe(200)
    expect(settings.autoUpdateSkills).toBe(true)
    expect(JSON.parse(await Bun.file(join(tempDir, 'settings.json')).text())).toEqual({
      autoUpdateSkills: true
    })

    const readBack = await api.request('/api/settings')
    expect(((await readBack.json()) as AppSettings).autoUpdateSkills).toBe(true)
  })

  test('rejects a non-boolean flag and unknown-only patches change nothing', async () => {
    const invalid = await api.request('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ autoUpdateSkills: 'yes' })
    })
    expect(invalid.status).toBe(400)

    const unknown = await api.request('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nope: true })
    })
    expect(unknown.status).toBe(200)
    expect((await unknown.json()) as AppSettings).toEqual({ autoUpdateSkills: false })
  })
})
