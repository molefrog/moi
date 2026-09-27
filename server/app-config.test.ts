import { describe, expect, spyOn, test } from 'bun:test'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'path'

import { clientAppConfig, getAppConfig, loadAppConfig, resetAppConfig } from './app-config'

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
    cloudDemo: false,
    experiments: [],
    experimentalCollab: false,
    demoInstallUrl: 'https://moi.computer',
    cloudflareAccess: null
  })
})

test('config file values override defaults', async () => {
  const file = await configFile(
    JSON.stringify({
      cloudDemo: true,
      experiments: ['new-chat-ui'],
      demoInstallUrl: 'https://moi.computer/download'
    })
  )
  const config = loadAppConfig(file, NO_ENV)
  expect(config.cloudDemo).toBe(true)
  expect(config.experiments).toEqual(['new-chat-ui'])
  expect(config.demoInstallUrl).toBe('https://moi.computer/download')
})

test('env vars override the config file', async () => {
  const file = await configFile(JSON.stringify({ cloudDemo: true, experiments: ['from-file'] }))
  const config = loadAppConfig(file, {
    MOI_CLOUD_DEMO: '0',
    MOI_EXPERIMENTS: ' a, b ,,c '
  })
  expect(config.cloudDemo).toBe(false)
  expect(config.experiments).toEqual(['a', 'b', 'c'])
})

test('boolean env accepts 1/true/0/false and ignores anything else', () => {
  const on = (value: string) => loadAppConfig('/nonexistent', { MOI_CLOUD_DEMO: value }).cloudDemo
  expect(on('1')).toBe(true)
  expect(on('TRUE')).toBe(true)
  expect(on('0')).toBe(false)
  expect(on('maybe')).toBe(false) // unparseable → default
})

test('empty MOI_EXPERIMENTS clears file-set experiments', async () => {
  const file = await configFile(JSON.stringify({ experiments: ['from-file'] }))
  const config = loadAppConfig(file, { MOI_EXPERIMENTS: '' })
  expect(config.experiments).toEqual([])
})

test('collab ignores config files, experiment slugs and legacy environment settings', async () => {
  const file = await configFile(
    JSON.stringify({ experimentalCollab: true, experiments: ['collab'], collab: { enabled: true } })
  )
  const config = loadAppConfig(file, {
    MOI_EXPERIMENTS: 'collab',
    MOI_COLLAB: '1',
    MOI_DEV: '1',
    MOI_COLLAB_IDENTITY: 'local'
  })
  expect(config.experimentalCollab).toBe(false)
  expect(config.experiments).toEqual(['collab'])
})

test('collab accepts only explicit startup flags', async () => {
  const file = await configFile(JSON.stringify({ experimentalCollab: false }))
  expect(loadAppConfig(file, NO_ENV).experimentalCollab).toBe(false)
  expect(loadAppConfig(file, NO_ENV, { experimentalCollab: true }).experimentalCollab).toBe(true)
  expect(loadAppConfig(file, NO_ENV, { experimentalCollab: false }).experimentalCollab).toBe(false)
})

test('invalid JSON falls back to defaults without throwing', async () => {
  const file = await configFile('{ not json')
  const config = loadAppConfig(file, NO_ENV)
  expect(config.cloudDemo).toBe(false)
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
    expect(config.cloudDemo).toBe(false)
    expect(errors.join('\n')).toContain('could not read')
  } finally {
    spy.mockRestore()
  }
})

test('wrong-typed keys are dropped individually, valid keys survive', async () => {
  const file = await configFile(
    JSON.stringify({ cloudDemo: 'yes', experiments: ['kept'], demoInstallUrl: 42 })
  )
  const config = loadAppConfig(file, NO_ENV)
  expect(config.cloudDemo).toBe(false)
  expect(config.experiments).toEqual(['kept'])
  expect(config.demoInstallUrl).toBe('https://moi.computer')
})

test('the resolved config is frozen', () => {
  const config = loadAppConfig('/nonexistent', NO_ENV)
  expect(Object.isFrozen(config)).toBe(true)
})

describe('Cloudflare Access', () => {
  const ISSUER = 'https://acme.cloudflareaccess.com'

  function quietly<T>(run: () => T): { value: T; warnings: string } {
    const errors: string[] = []
    const spy = spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args.map(String).join(' '))
    })
    try {
      return { value: run(), warnings: errors.join('\n') }
    } finally {
      spy.mockRestore()
    }
  }

  test('config.json supplies the team domain and audience tags', async () => {
    const file = await configFile(
      JSON.stringify({ cloudflareAccess: { teamDomain: ISSUER, audience: ['aud-1', ' aud-2 '] } })
    )
    const { cloudflareAccess } = loadAppConfig(file, NO_ENV)
    expect(cloudflareAccess).toEqual({ teamDomain: ISSUER, audience: ['aud-1', 'aud-2'] })
    expect(Object.isFrozen(cloudflareAccess)).toBe(true)
    expect(Object.isFrozen(cloudflareAccess?.audience)).toBe(true)
  })

  test('team domains normalize to the token issuer origin', () => {
    const issuer = (value: string) =>
      loadAppConfig('/nonexistent', {
        MOI_CLOUDFLARE_ACCESS_TEAM_DOMAIN: value,
        MOI_CLOUDFLARE_ACCESS_AUD: 'aud'
      }).cloudflareAccess?.teamDomain
    expect(issuer('acme')).toBe(ISSUER)
    expect(issuer('acme.cloudflareaccess.com')).toBe(ISSUER)
    expect(issuer(' https://acme.cloudflareaccess.com/ ')).toBe(ISSUER)
    for (const invalid of [
      'http://acme.cloudflareaccess.com',
      'https://acme.cloudflareaccess.com/cdn-cgi/access/certs',
      'https://user:secret@acme.cloudflareaccess.com',
      'https://acme.cloudflareaccess.com?team=1'
    ]) {
      const { value, warnings } = quietly(() => issuer(invalid))
      expect(value).toBeUndefined()
      expect(warnings).toContain('MOI_CLOUDFLARE_ACCESS_TEAM_DOMAIN')
    }
  })

  test('env overrides config.json per field', async () => {
    const file = await configFile(
      JSON.stringify({ cloudflareAccess: { teamDomain: 'other', audience: 'from-file' } })
    )
    expect(
      loadAppConfig(file, { MOI_CLOUDFLARE_ACCESS_TEAM_DOMAIN: 'acme' }).cloudflareAccess
    ).toEqual({ teamDomain: ISSUER, audience: ['from-file'] })
    expect(loadAppConfig(file, { MOI_CLOUDFLARE_ACCESS_AUD: 'a, b' }).cloudflareAccess).toEqual({
      teamDomain: 'https://other.cloudflareaccess.com',
      audience: ['a', 'b']
    })
  })

  test('half a configuration trusts no proxy identity and says why', async () => {
    const { value, warnings } = quietly(() =>
      loadAppConfig('/nonexistent', { MOI_CLOUDFLARE_ACCESS_TEAM_DOMAIN: 'acme' })
    )
    expect(value.cloudflareAccess).toBeNull()
    expect(warnings).toContain('needs both a team domain and an audience')

    const file = await configFile(
      JSON.stringify({ cloudflareAccess: { teamDomain: 42, audience: [] } })
    )
    const invalid = quietly(() => loadAppConfig(file, NO_ENV))
    expect(invalid.value.cloudflareAccess).toBeNull()
    expect(invalid.warnings).toContain('cloudflareAccess.teamDomain')
    expect(invalid.warnings).toContain('cloudflareAccess.audience')
  })

  test('the access config never reaches the browser config', () => {
    const saved = {
      team: process.env.MOI_CLOUDFLARE_ACCESS_TEAM_DOMAIN,
      aud: process.env.MOI_CLOUDFLARE_ACCESS_AUD
    }
    process.env.MOI_CLOUDFLARE_ACCESS_TEAM_DOMAIN = 'acme'
    process.env.MOI_CLOUDFLARE_ACCESS_AUD = 'aud'
    resetAppConfig()
    try {
      expect(getAppConfig().cloudflareAccess).not.toBeNull()
      expect(Object.keys(clientAppConfig())).not.toContain('cloudflareAccess')
    } finally {
      for (const [key, value] of [
        ['MOI_CLOUDFLARE_ACCESS_TEAM_DOMAIN', saved.team],
        ['MOI_CLOUDFLARE_ACCESS_AUD', saved.aud]
      ] as const) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
      resetAppConfig()
    }
  })
})
