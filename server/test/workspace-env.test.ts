import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'path'

import {
  getWorkspaceEnvSettings,
  getWorkspaceEnvView,
  isValidEnvKey,
  resolveWorkspaceEnv,
  setWorkspaceEnvStorePath,
  updateWorkspaceEnvSettings
} from '../workspace-env'

let wsDir: string
let storeDir: string

beforeEach(async () => {
  wsDir = await mkdtemp(join(tmpdir(), 'moi-env-ws-'))
  storeDir = await mkdtemp(join(tmpdir(), 'moi-env-store-'))
  setWorkspaceEnvStorePath(join(storeDir, 'workspace-env.json'))
})

afterEach(async () => {
  await rm(wsDir, { recursive: true, force: true })
  await rm(storeDir, { recursive: true, force: true })
})

describe('isValidEnvKey', () => {
  test('accepts conventional names, rejects junk', () => {
    expect(isValidEnvKey('ELEVENLABS_API_KEY')).toBe(true)
    expect(isValidEnvKey('_x')).toBe(true)
    expect(isValidEnvKey('1ABC')).toBe(false)
    expect(isValidEnvKey('has space')).toBe(false)
    expect(isValidEnvKey('a-b')).toBe(false)
    expect(isValidEnvKey('')).toBe(false)
  })
})

describe('resolveWorkspaceEnv', () => {
  test('returns empty when nothing is configured', async () => {
    expect(await resolveWorkspaceEnv(wsDir)).toEqual({})
  })

  test('parses .env via node:util parseEnv', async () => {
    await writeFile(join(wsDir, '.env'), 'A=1\n# comment\nB="two words"\n')
    expect(await resolveWorkspaceEnv(wsDir)).toEqual({ A: '1', B: 'two words' })
  })

  test('.env.local overrides .env', async () => {
    await writeFile(join(wsDir, '.env'), 'A=base\nB=base\n')
    await writeFile(join(wsDir, '.env.local'), 'B=local\n')
    expect(await resolveWorkspaceEnv(wsDir)).toEqual({ A: 'base', B: 'local' })
  })

  test('custom overrides win over .env', async () => {
    await writeFile(join(wsDir, '.env'), 'TOKEN=from-dotenv\n')
    await updateWorkspaceEnvSettings(wsDir, { custom: { TOKEN: 'from-ui', EXTRA: 'x' } })
    expect(await resolveWorkspaceEnv(wsDir)).toEqual({ TOKEN: 'from-ui', EXTRA: 'x' })
  })

  test('inheritDotenv=false ignores .env, keeps custom', async () => {
    await writeFile(join(wsDir, '.env'), 'A=1\n')
    await updateWorkspaceEnvSettings(wsDir, { custom: { B: '2' }, inheritDotenv: false })
    expect(await resolveWorkspaceEnv(wsDir)).toEqual({ B: '2' })
  })
})

describe('updateWorkspaceEnvSettings', () => {
  test('drops invalid keys and non-string values', async () => {
    const settings = await updateWorkspaceEnvSettings(wsDir, {
      // @ts-expect-error testing runtime guard against non-string values
      custom: { GOOD: 'ok', 'bad key': 'x', NUM: 3 }
    })
    expect(settings.custom).toEqual({ GOOD: 'ok' })
  })

  test('inheritDotenv defaults to true and persists toggles', async () => {
    expect((await getWorkspaceEnvSettings(wsDir)).inheritDotenv).toBe(true)
    await updateWorkspaceEnvSettings(wsDir, { inheritDotenv: false })
    expect((await getWorkspaceEnvSettings(wsDir)).inheritDotenv).toBe(false)
    // Updating custom alone leaves the flag intact.
    await updateWorkspaceEnvSettings(wsDir, { custom: { A: '1' } })
    expect((await getWorkspaceEnvSettings(wsDir)).inheritDotenv).toBe(false)
  })
})

describe('getWorkspaceEnvView', () => {
  test('reports source, files, and masks .env values', async () => {
    await writeFile(join(wsDir, '.env'), 'SHARED=dotenv\nONLY_ENV=x\n')
    await writeFile(join(wsDir, '.env.local'), 'SHARED=dotenv\n')
    await updateWorkspaceEnvSettings(wsDir, { custom: { SHARED: 'ui', ONLY_CUSTOM: 'y' } })

    const view = await getWorkspaceEnvView(wsDir)
    const byKey = Object.fromEntries(view.vars.map(v => [v.key, v]))

    expect(byKey.SHARED.source).toBe('both')
    expect(byKey.SHARED.value).toBe('ui') // custom wins, value exposed
    expect(byKey.SHARED.files).toEqual(['.env', '.env.local'])

    expect(byKey.ONLY_ENV.source).toBe('dotenv')
    expect(byKey.ONLY_ENV.value).toBeUndefined() // .env values stay masked

    expect(byKey.ONLY_CUSTOM.source).toBe('custom')
    expect(byKey.ONLY_CUSTOM.value).toBe('y')

    expect(view.files).toEqual([
      { file: '.env', count: 2 },
      { file: '.env.local', count: 1 }
    ])
    expect(view.inheritDotenv).toBe(true)
  })

  test('computes required satisfaction against the effective env', async () => {
    await writeFile(join(wsDir, '.env'), 'PRESENT=1\n')
    const view = await getWorkspaceEnvView(wsDir, {
      PRESENT: ['weather'],
      MISSING: ['tts']
    })
    const required = Object.fromEntries(view.required.map(r => [r.key, r]))
    expect(required.PRESENT.satisfied).toBe(true)
    expect(required.PRESENT.widgets).toEqual(['weather'])
    expect(required.MISSING.satisfied).toBe(false)
  })

  test('inheritDotenv=false hides .env from the view', async () => {
    await writeFile(join(wsDir, '.env'), 'A=1\n')
    await updateWorkspaceEnvSettings(wsDir, { inheritDotenv: false })
    const view = await getWorkspaceEnvView(wsDir)
    expect(view.vars).toEqual([])
    // Files are still discovered (shown for reference), just not injected.
    expect(view.files).toEqual([{ file: '.env', count: 1 }])
  })
})
