import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'path'

import {
  getWorkspaceEnvView,
  isValidEnvKey,
  resetWorkspaceEnvForTest,
  resolveWorkspaceEnv,
  setSecretStoreBackend,
  setWorkspaceEnvStorePath,
  updateWorkspaceEnv
} from '../workspace-env'

let wsDir: string
let storeDir: string
let secretPath: string

beforeEach(async () => {
  wsDir = await mkdtemp(join(tmpdir(), 'moi-env-ws-'))
  storeDir = await mkdtemp(join(tmpdir(), 'moi-env-store-'))
  secretPath = join(storeDir, 'workspace-secrets.json')
  setWorkspaceEnvStorePath(join(storeDir, 'workspace-env.json'), secretPath)
  // Pin the file backend so tests never touch the real OS keychain.
  setSecretStoreBackend('file')
})

afterEach(async () => {
  resetWorkspaceEnvForTest()
  await rm(wsDir, { recursive: true, force: true })
  await rm(storeDir, { recursive: true, force: true })
})

describe('validation helpers', () => {
  test('isValidEnvKey', () => {
    expect(isValidEnvKey('ELEVENLABS_API_KEY')).toBe(true)
    expect(isValidEnvKey('1ABC')).toBe(false)
    expect(isValidEnvKey('a-b')).toBe(false)
  })
})

describe('resolveWorkspaceEnv — dotenv', () => {
  test('empty when nothing configured', async () => {
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

  test('inheritDotenv=false ignores .env', async () => {
    await writeFile(join(wsDir, '.env'), 'A=1\n')
    await updateWorkspaceEnv(wsDir, { inheritDotenv: false })
    expect(await resolveWorkspaceEnv(wsDir)).toEqual({})
  })
})

describe('resolveWorkspaceEnv — custom secrets', () => {
  test('custom wins over .env', async () => {
    await writeFile(join(wsDir, '.env'), 'TOKEN=from-dotenv\n')
    await updateWorkspaceEnv(wsDir, { set: { TOKEN: 'from-ui' } })
    expect(await resolveWorkspaceEnv(wsDir)).toEqual({ TOKEN: 'from-ui' })
  })

  test('custom secrets merge with .env keys', async () => {
    await writeFile(join(wsDir, '.env'), 'A=1\n')
    await updateWorkspaceEnv(wsDir, { set: { K: 'v' } })
    expect(await resolveWorkspaceEnv(wsDir)).toEqual({ A: '1', K: 'v' })
  })
})

describe('updateWorkspaceEnv — patch semantics', () => {
  test('set upserts, remove deletes, others untouched', async () => {
    await updateWorkspaceEnv(wsDir, { set: { A: '1', B: '2' } })
    await updateWorkspaceEnv(wsDir, { set: { B: '22', C: '3' }, remove: ['A'] })
    expect(await resolveWorkspaceEnv(wsDir)).toEqual({ B: '22', C: '3' })
  })

  test('remove then re-add round-trips', async () => {
    await updateWorkspaceEnv(wsDir, { set: { A: '1' } })
    await updateWorkspaceEnv(wsDir, { remove: ['A'] })
    await updateWorkspaceEnv(wsDir, { set: { A: 'again' } })
    expect(await resolveWorkspaceEnv(wsDir)).toEqual({ A: 'again' })
  })

  test('drops invalid keys and non-string values', async () => {
    await updateWorkspaceEnv(wsDir, {
      // @ts-expect-error testing runtime guard against non-string values
      set: { GOOD: 'ok', 'bad key': 'x', NUM: 3 }
    })
    const view = await getWorkspaceEnvView(wsDir)
    expect(view.vars.map(v => v.key)).toEqual(['GOOD'])
  })

  test('concurrent updates do not lose writes (serialized per workspace)', async () => {
    await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        updateWorkspaceEnv(wsDir, { set: { [`K${i}`]: `${i}` } })
      )
    )
    const env = await resolveWorkspaceEnv(wsDir)
    expect(Object.keys(env).sort()).toEqual(Array.from({ length: 12 }, (_, i) => `K${i}`).sort())
  })
})

describe('getWorkspaceEnvView', () => {
  test('reports source/files and never leaks values', async () => {
    await writeFile(join(wsDir, '.env'), 'SHARED=dotenv\nONLY_ENV=x\n')
    await writeFile(join(wsDir, '.env.local'), 'SHARED=dotenv\n')
    await updateWorkspaceEnv(wsDir, { set: { SHARED: 'ui', ONLY_CUSTOM: 'y' } })

    const view = await getWorkspaceEnvView(wsDir)
    const byKey = Object.fromEntries(view.vars.map(v => [v.key, v]))

    expect(byKey.SHARED.source).toBe('both')
    expect(byKey.SHARED.files).toEqual(['.env', '.env.local'])

    expect(byKey.ONLY_ENV.source).toBe('dotenv')
    expect(byKey.ONLY_CUSTOM.source).toBe('custom')

    // No var carries a value — the API is write-only for secrets.
    for (const v of view.vars) expect('value' in v).toBe(false)

    expect(view.files).toEqual([
      { file: '.env', count: 2 },
      { file: '.env.local', count: 1 }
    ])
    expect(view.inheritDotenv).toBe(true)
    expect(view.backend).toBe('file')
  })

  test('required satisfied only when in the effective env', async () => {
    await writeFile(join(wsDir, '.env'), 'PRESENT=1\n')
    await updateWorkspaceEnv(wsDir, { set: { CUSTOM_KEY: 'a' } })
    const view = await getWorkspaceEnvView(wsDir, {
      PRESENT: ['weather'],
      CUSTOM_KEY: ['tts'],
      MISSING: ['tts']
    })
    const req = Object.fromEntries(view.required.map(r => [r.key, r]))
    expect(req.PRESENT.satisfied).toBe(true)
    expect(req.CUSTOM_KEY.satisfied).toBe(true)
    expect(req.MISSING.satisfied).toBe(false)
  })
})

describe('file secret store hardening', () => {
  test('secrets file is written 0600', async () => {
    await updateWorkspaceEnv(wsDir, { set: { SECRET: 'shh' } })
    const mode = (await stat(secretPath)).mode & 0o777
    expect(mode).toBe(0o600)
  })
})
