import { afterEach, describe, expect, test } from 'bun:test'

import {
  detectPackageManager,
  fetchLatestVersion,
  isNewer,
  manualUpdateLines,
  updateArgv
} from '../update'
import { isPrerelease } from '../version'

// ---- version comparison -----------------------------------------------------

describe('isNewer', () => {
  test('orders plain versions', () => {
    expect(isNewer('0.5.3', '0.5.2')).toBe(true)
    expect(isNewer('0.5.2', '0.5.2')).toBe(false)
    expect(isNewer('0.5.1', '0.5.2')).toBe(false)
  })

  test('a release is newer than its own prerelease', () => {
    expect(isNewer('0.5.2', '0.5.2-next.1')).toBe(true)
    expect(isNewer('0.5.2-next.1', '0.5.2')).toBe(false)
  })

  test('garbage compares as not newer', () => {
    expect(isNewer('not-a-version', '0.5.2')).toBe(false)
  })
})

describe('isPrerelease', () => {
  test('detects prerelease markers', () => {
    expect(isPrerelease('0.5.2-next.1')).toBe(true)
    expect(isPrerelease('1.0.0-rc.0')).toBe(true)
    expect(isPrerelease('0.5.2')).toBe(false)
  })
})

// ---- owning package manager -------------------------------------------------

describe('detectPackageManager', () => {
  const noNpm = () => Promise.resolve<string | null>(null)

  test('bun global tree', async () => {
    expect(
      await detectPackageManager('/home/u/.bun/install/global/node_modules/moi-computer', noNpm)
    ).toBe('bun')
  })

  test('pnpm global tree (realpath lands in .pnpm store)', async () => {
    expect(
      await detectPackageManager(
        '/home/u/.local/share/pnpm/global/5/.pnpm/moi-computer@0.5.2/node_modules/moi-computer',
        noNpm
      )
    ).toBe('pnpm')
  })

  test('yarn classic global tree', async () => {
    expect(
      await detectPackageManager('/home/u/.config/yarn/global/node_modules/moi-computer', noNpm)
    ).toBe('yarn')
  })

  test('npm confirmed by npm root -g', async () => {
    expect(
      await detectPackageManager('/usr/local/lib/node_modules/moi-computer', () =>
        Promise.resolve('/usr/local/lib/node_modules')
      )
    ).toBe('npm')
    expect(
      await detectPackageManager('/opt/homebrew/lib/node_modules/moi-computer', () =>
        Promise.resolve('/opt/homebrew/lib/node_modules')
      )
    ).toBe('npm')
  })

  test('unknown when nothing matches', async () => {
    expect(await detectPackageManager('/srv/random/moi-computer', noNpm)).toBeNull()
    expect(
      await detectPackageManager('/srv/random/moi-computer', () =>
        Promise.resolve('/usr/local/lib/node_modules')
      )
    ).toBeNull()
  })
})

// ---- update commands --------------------------------------------------------

describe('updateArgv', () => {
  test('pins the resolved version through the owning manager', () => {
    expect(updateArgv('bun', '0.6.0')).toEqual(['bun', 'install', '-g', 'moi-computer@0.6.0'])
    expect(updateArgv('npm', '0.6.0')).toEqual(['npm', 'install', '-g', 'moi-computer@0.6.0'])
    expect(updateArgv('pnpm', '0.6.0')).toEqual(['pnpm', 'add', '-g', 'moi-computer@0.6.0'])
    expect(updateArgv('yarn', '0.6.0')).toEqual(['yarn', 'global', 'add', 'moi-computer@0.6.0'])
  })

  test('manual lines cover every manager', () => {
    const lines = manualUpdateLines('0.6.0')
    expect(lines).toHaveLength(4)
    for (const line of lines) expect(line).toContain('moi-computer@0.6.0')
  })
})

// ---- registry ---------------------------------------------------------------

describe('fetchLatestVersion', () => {
  let server: ReturnType<typeof Bun.serve> | null = null
  afterEach(() => {
    server?.stop(true)
    server = null
    delete process.env.MOI_NPM_REGISTRY
  })

  function mockRegistry(handler: (req: Request) => Response) {
    server = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: handler })
    process.env.MOI_NPM_REGISTRY = `http://127.0.0.1:${server.port}`
  }

  test('resolves the latest dist-tag', async () => {
    mockRegistry(req => {
      expect(new URL(req.url).pathname).toBe('/moi-computer/latest')
      return Response.json({ version: '0.6.0' })
    })
    expect(await fetchLatestVersion()).toBe('0.6.0')
  })

  test('friendly error on a registry error status', async () => {
    mockRegistry(() => new Response('nope', { status: 503 }))
    expect(fetchLatestVersion()).rejects.toThrow(/registry returned 503/)
  })

  test('friendly error on malformed payload', async () => {
    mockRegistry(() => Response.json({ nope: true }))
    expect(fetchLatestVersion()).rejects.toThrow(/Unexpected npm registry response/)
  })

  test('friendly error when unreachable', async () => {
    process.env.MOI_NPM_REGISTRY = 'http://127.0.0.1:1'
    expect(fetchLatestVersion()).rejects.toThrow(/Could not reach the npm registry/)
  })
})
