import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'path'

import {
  getWorkspaceEnvView,
  isValidEnvKey,
  isValidScope,
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
  setSecretStoreBackend('auto')
  await rm(wsDir, { recursive: true, force: true })
  await rm(storeDir, { recursive: true, force: true })
})

describe('validation helpers', () => {
  test('isValidEnvKey', () => {
    expect(isValidEnvKey('ELEVENLABS_API_KEY')).toBe(true)
    expect(isValidEnvKey('1ABC')).toBe(false)
    expect(isValidEnvKey('a-b')).toBe(false)
  })

  test('isValidScope', () => {
    expect(isValidScope('widgets')).toBe(true)
    expect(isValidScope('agent')).toBe(true)
    expect(isValidScope('both')).toBe(true)
    expect(isValidScope('nope')).toBe(false)
    expect(isValidScope(undefined)).toBe(false)
  })
})

describe('resolveWorkspaceEnv — dotenv', () => {
  test('empty when nothing configured', async () => {
    expect(await resolveWorkspaceEnv(wsDir, 'widgets')).toEqual({})
  })

  test('parses .env via node:util parseEnv, feeds both sinks', async () => {
    await writeFile(join(wsDir, '.env'), 'A=1\n# comment\nB="two words"\n')
    expect(await resolveWorkspaceEnv(wsDir, 'widgets')).toEqual({ A: '1', B: 'two words' })
    expect(await resolveWorkspaceEnv(wsDir, 'agent')).toEqual({ A: '1', B: 'two words' })
  })

  test('.env.local overrides .env', async () => {
    await writeFile(join(wsDir, '.env'), 'A=base\nB=base\n')
    await writeFile(join(wsDir, '.env.local'), 'B=local\n')
    expect(await resolveWorkspaceEnv(wsDir, 'agent')).toEqual({ A: 'base', B: 'local' })
  })

  test('inheritDotenv=false ignores .env', async () => {
    await writeFile(join(wsDir, '.env'), 'A=1\n')
    await updateWorkspaceEnv(wsDir, { inheritDotenv: false })
    expect(await resolveWorkspaceEnv(wsDir, 'widgets')).toEqual({})
  })
})

describe('resolveWorkspaceEnv — custom secrets + scope', () => {
  test('custom wins over .env', async () => {
    await writeFile(join(wsDir, '.env'), 'TOKEN=from-dotenv\n')
    await updateWorkspaceEnv(wsDir, { set: { TOKEN: 'from-ui' } })
    expect(await resolveWorkspaceEnv(wsDir, 'widgets')).toEqual({ TOKEN: 'from-ui' })
  })

  test('scope gates which sink sees a secret', async () => {
    await updateWorkspaceEnv(wsDir, {
      set: { W_ONLY: 'w', A_ONLY: 'a', SHARED: 's' },
      scopes: { W_ONLY: 'widgets', A_ONLY: 'agent', SHARED: 'both' }
    })
    expect(await resolveWorkspaceEnv(wsDir, 'widgets')).toEqual({ W_ONLY: 'w', SHARED: 's' })
    expect(await resolveWorkspaceEnv(wsDir, 'agent')).toEqual({ A_ONLY: 'a', SHARED: 's' })
  })

  test('new keys default to scope both', async () => {
    await updateWorkspaceEnv(wsDir, { set: { K: 'v' } })
    expect(await resolveWorkspaceEnv(wsDir, 'widgets')).toEqual({ K: 'v' })
    expect(await resolveWorkspaceEnv(wsDir, 'agent')).toEqual({ K: 'v' })
  })
})

describe('updateWorkspaceEnv — patch semantics', () => {
  test('set upserts, remove deletes, others untouched', async () => {
    await updateWorkspaceEnv(wsDir, { set: { A: '1', B: '2' } })
    await updateWorkspaceEnv(wsDir, { set: { B: '22', C: '3' }, remove: ['A'] })
    expect(await resolveWorkspaceEnv(wsDir, 'widgets')).toEqual({ B: '22', C: '3' })
  })

  test('removing a key drops its scope metadata', async () => {
    await updateWorkspaceEnv(wsDir, { set: { A: '1' }, scopes: { A: 'agent' } })
    await updateWorkspaceEnv(wsDir, { remove: ['A'] })
    await updateWorkspaceEnv(wsDir, { set: { A: 'again' } })
    // Re-added A defaults back to 'both', not the stale 'agent'.
    expect(await resolveWorkspaceEnv(wsDir, 'widgets')).toEqual({ A: 'again' })
  })

  test('drops invalid keys and non-string values', async () => {
    await updateWorkspaceEnv(wsDir, {
      // @ts-expect-error testing runtime guard against non-string values
      set: { GOOD: 'ok', 'bad key': 'x', NUM: 3 }
    })
    const view = await getWorkspaceEnvView(wsDir)
    expect(view.vars.map(v => v.key)).toEqual(['GOOD'])
  })
})

describe('getWorkspaceEnvView', () => {
  test('reports source/scope/files and never leaks values', async () => {
    await writeFile(join(wsDir, '.env'), 'SHARED=dotenv\nONLY_ENV=x\n')
    await writeFile(join(wsDir, '.env.local'), 'SHARED=dotenv\n')
    await updateWorkspaceEnv(wsDir, {
      set: { SHARED: 'ui', ONLY_CUSTOM: 'y' },
      scopes: { ONLY_CUSTOM: 'agent' }
    })

    const view = await getWorkspaceEnvView(wsDir)
    const byKey = Object.fromEntries(view.vars.map(v => [v.key, v]))

    expect(byKey.SHARED.source).toBe('both')
    expect(byKey.SHARED.scope).toBe('both')
    expect(byKey.SHARED.files).toEqual(['.env', '.env.local'])

    expect(byKey.ONLY_ENV.source).toBe('dotenv')
    expect(byKey.ONLY_CUSTOM.source).toBe('custom')
    expect(byKey.ONLY_CUSTOM.scope).toBe('agent')

    // No var carries a value — the API is write-only for secrets.
    for (const v of view.vars) expect('value' in v).toBe(false)

    expect(view.files).toEqual([
      { file: '.env', count: 2 },
      { file: '.env.local', count: 1 }
    ])
    expect(view.inheritDotenv).toBe(true)
    expect(view.backend).toBe('file')
  })

  test('required satisfied only when visible to widgets', async () => {
    await writeFile(join(wsDir, '.env'), 'PRESENT=1\n')
    await updateWorkspaceEnv(wsDir, {
      set: { AGENT_KEY: 'a' },
      scopes: { AGENT_KEY: 'agent' }
    })
    const view = await getWorkspaceEnvView(wsDir, {
      PRESENT: ['weather'],
      AGENT_KEY: ['tts'], // present but agent-scoped → not visible to widgets
      MISSING: ['tts']
    })
    const req = Object.fromEntries(view.required.map(r => [r.key, r]))
    expect(req.PRESENT.satisfied).toBe(true)
    expect(req.AGENT_KEY.satisfied).toBe(false)
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
