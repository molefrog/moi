import { expect, spyOn, test } from 'bun:test'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'path'

import { loadAppConfig } from './app-config'

const NO_ENV: Record<string, string | undefined> = {}

async function configFile(contents: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'moi-app-config-'))
  const file = join(dir, 'config.json')
  await writeFile(file, contents)
  return file
}

test('defaults apply when no config file exists', () => {
  const config = loadAppConfig('/nonexistent/config.json', NO_ENV)
  expect(config).toEqual({
    environment: 'local',
    demo: false,
    experimental: { collab: false },
    demoInstallUrl: 'https://moi.computer',
    cloudflareAccess: null,
    workspacesDir: null,
    agentLauncher: null,
    unixSocket: null
  })
})

test('config file values override defaults', async () => {
  const file = await configFile(
    JSON.stringify({
      demo: true,
      experimental: { collab: true },
      demoInstallUrl: 'https://moi.computer/download'
    })
  )
  const config = loadAppConfig(file, NO_ENV)
  expect(config.demo).toBe(true)
  expect(config.experimental.collab).toBe(false)
  expect(config.demoInstallUrl).toBe('https://moi.computer/download')
})

test('env vars override the config file', async () => {
  const file = await configFile(JSON.stringify({ demo: true, experimental: { collab: true } }))
  const config = loadAppConfig(file, {
    MOI_DEMO: '0'
  })
  expect(config.demo).toBe(false)
  expect(config.experimental.collab).toBe(false)
})

test('boolean env accepts 1/true/0/false and ignores anything else', () => {
  const on = (value: string) => loadAppConfig('/nonexistent', { MOI_DEMO: value }).demo
  expect(on('1')).toBe(true)
  expect(on('TRUE')).toBe(true)
  expect(on('0')).toBe(false)
  expect(on('maybe')).toBe(false) // unparseable → default
})

test('legacy experiment names and collab settings do not enable collaboration', async () => {
  const file = await configFile(
    JSON.stringify({ experimentalCollab: true, experiments: ['collab'], collab: { enabled: true } })
  )
  const config = loadAppConfig(file, {
    MOI_EXPERIMENTS: 'collab',
    MOI_COLLAB: '1',
    MOI_DEV: '1'
  })
  expect(config.experimental.collab).toBe(false)
})

test('only an explicit CLI flag enables collaboration', async () => {
  const file = await configFile(JSON.stringify({ experimental: { collab: true } }))
  expect(loadAppConfig(file, NO_ENV).experimental.collab).toBe(false)
  expect(loadAppConfig(file, NO_ENV, { collab: true }).experimental.collab).toBe(true)
})

test('invalid JSON falls back to defaults without throwing', async () => {
  const file = await configFile('{ not json')
  const config = loadAppConfig(file, NO_ENV)
  expect(config.demo).toBe(false)
})

test('a read failure other than a missing file warns instead of staying silent', async () => {
  const errors: string[] = []
  const spy = spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    errors.push(args.map(String).join(' '))
  })
  try {
    // A directory as the config path throws EISDIR — a stand-in for any
    // non-ENOENT failure (permissions, mount errors).
    const dir = await mkdtemp(join(tmpdir(), 'moi-app-config-'))
    const config = loadAppConfig(dir, NO_ENV)
    expect(config.demo).toBe(false)
    expect(errors.join('\n')).toContain('could not read')
  } finally {
    spy.mockRestore()
  }
})

test('wrong-typed keys are dropped individually, valid keys survive', async () => {
  const file = await configFile(
    JSON.stringify({ demo: 'yes', experimental: { collab: true }, demoInstallUrl: 42 })
  )
  const config = loadAppConfig(file, NO_ENV)
  expect(config.demo).toBe(false)
  expect(config.experimental.collab).toBe(false)
  expect(config.demoInstallUrl).toBe('https://moi.computer')
})

test('managed-machine paths come from config.json only, and must be absolute', async () => {
  const errors: string[] = []
  const spy = spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    errors.push(args.map(String).join(' '))
  })
  try {
    const file = await configFile(
      JSON.stringify({
        workspacesDir: '/data/workspaces',
        agentLauncher: '/opt/moi/bin/agent-run',
        unixSocket: 'run/moi/web.sock'
      })
    )
    const config = loadAppConfig(file, {
      MOI_WORKSPACES_DIR: '/elsewhere',
      MOI_AGENT_LAUNCHER: '/tmp/launcher'
    })
    expect(config.workspacesDir).toBe('/data/workspaces')
    expect(config.agentLauncher).toBe('/opt/moi/bin/agent-run')
    expect(config.unixSocket).toBeNull()
    expect(errors.join('\n')).toContain('"unixSocket"')
  } finally {
    spy.mockRestore()
  }
})

test('the resolved config is frozen', () => {
  const config = loadAppConfig('/nonexistent', NO_ENV)
  expect(Object.isFrozen(config)).toBe(true)
  expect(Object.isFrozen(config.experimental)).toBe(true)
})

const TEAM = 'MOI_CLOUDFLARE_ACCESS_TEAM_DOMAIN'
const AUD = 'MOI_CLOUDFLARE_ACCESS_AUD'
const access = (env: Record<string, string>) => loadAppConfig('/nonexistent', env).cloudflareAccess

test('Cloudflare Access reads config.json, normalizes the team domain, and env wins per field', async () => {
  const cloudflareAccess = { teamDomain: 'other', audience: ['aud-1', ' aud-2 '] }
  const file = await configFile(JSON.stringify({ cloudflareAccess }))
  expect(loadAppConfig(file, NO_ENV).cloudflareAccess).toEqual({
    teamDomain: 'https://other.cloudflareaccess.com',
    audience: ['aud-1', 'aud-2']
  })
  for (const team of ['acme', 'acme.cloudflareaccess.com', 'https://acme.cloudflareaccess.com/']) {
    expect(loadAppConfig(file, { [TEAM]: team, [AUD]: 'a, b' }).cloudflareAccess).toEqual({
      teamDomain: 'https://acme.cloudflareaccess.com',
      audience: ['a', 'b']
    })
  }
})

test('an invalid or partial Cloudflare Access config trusts no proxy and warns', () => {
  const warn = spyOn(console, 'error').mockImplementation(() => {})
  try {
    for (const team of ['http://acme.cloudflareaccess.com', 'acme.cloudflareaccess.com/certs'])
      expect(access({ [TEAM]: team, [AUD]: 'aud' })).toBeNull()
    expect(access({ [TEAM]: 'acme' })).toBeNull()
    expect(warn.mock.calls.join('\n')).toContain('needs both a team domain and an audience')
  } finally {
    warn.mockRestore()
  }
})

test('environment uses file settings and env overrides independently of demo', async () => {
  const file = await configFile(JSON.stringify({ environment: 'cloud', demo: false }))
  expect(loadAppConfig(file, NO_ENV).environment).toBe('cloud')
  const localDemo = loadAppConfig(file, { MOI_ENVIRONMENT: 'local', MOI_DEMO: '1' })
  expect(localDemo.environment).toBe('local')
  expect(localDemo.demo).toBe(true)
  expect(loadAppConfig('/nonexistent', { MOI_ENVIRONMENT: 'cloud' }).environment).toBe('cloud')
})

test('invalid environments warn and preserve the lower-precedence setting', async () => {
  const warning = spyOn(console, 'error').mockImplementation(() => {})
  try {
    const file = await configFile(JSON.stringify({ environment: 'cloud' }))
    expect(loadAppConfig(file, { MOI_ENVIRONMENT: 'desktop' }).environment).toBe('cloud')
    const invalidFile = await configFile(JSON.stringify({ environment: 42 }))
    expect(loadAppConfig(invalidFile, NO_ENV).environment).toBe('local')
    expect(warning.mock.calls.length).toBe(2)
  } finally {
    warning.mockRestore()
  }
})

test('demo alone keeps the default local environment', () => {
  expect(loadAppConfig('/nonexistent', { MOI_DEMO: '1' })).toMatchObject({
    demo: true,
    environment: 'local'
  })
})
