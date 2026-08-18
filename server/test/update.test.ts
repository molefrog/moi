import { afterEach, describe, expect, test } from 'bun:test'

import {
  UPDATE_RESTART_EXIT_CODE,
  __resetUpdateStateForTests,
  detectPackageManager,
  fetchLatestVersion,
  getCachedUpdateStatus,
  getUpdateStatus,
  hasRunningAgentSessions,
  installUpdate,
  isNewer,
  manualUpdateLines,
  owningManager,
  ownInstall,
  scheduleRestartForUpdate,
  superviseServerUpdates,
  updateArgv,
  updateInProgress
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
    await expect(fetchLatestVersion()).rejects.toThrow(/registry returned 503/)
  })

  test('friendly error on malformed payload', async () => {
    mockRegistry(() => Response.json({ nope: true }))
    await expect(fetchLatestVersion()).rejects.toThrow(/Unexpected npm registry response/)
  })

  test('friendly error when unreachable', async () => {
    process.env.MOI_NPM_REGISTRY = 'http://127.0.0.1:1'
    await expect(fetchLatestVersion()).rejects.toThrow(/Could not reach the npm registry/)
  })
})

describe('update status', () => {
  const globalInstall = {
    kind: 'global' as const,
    root: '/home/u/.bun/install/global/node_modules/moi-computer',
    bin: '/home/u/.bun/bin/moi'
  }

  afterEach(() => __resetUpdateStateForTests())

  test('only running sessions block an update', () => {
    expect(hasRunningAgentSessions([{ activity: 'running' }])).toBe(true)
    expect(hasRunningAgentSessions([{ activity: 'requires-action' }, { activity: 'idle' }])).toBe(
      false
    )
  })

  test('keeps checkout, prerelease, current, failed, and unknown-manager checks hidden', async () => {
    expect(
      await getUpdateStatus({
        runningVersion: '0.5.2',
        analysis: { kind: 'checkout', root: '/repo', reason: 'git checkout' }
      })
    ).toEqual({ runningVersion: '0.5.2', availableVersion: null })
    expect(
      await getUpdateStatus({
        runningVersion: '0.6.0-next.1',
        analysis: globalInstall
      })
    ).toEqual({ runningVersion: '0.6.0-next.1', availableVersion: null })
    expect(
      await getUpdateStatus({
        runningVersion: '0.6.0',
        analysis: globalInstall,
        fetchLatest: async () => '0.6.0'
      })
    ).toEqual({ runningVersion: '0.6.0', availableVersion: null })
    expect(
      await getUpdateStatus({
        runningVersion: '0.5.2',
        analysis: globalInstall,
        fetchLatest: async () => {
          throw new Error('offline')
        }
      })
    ).toEqual({ runningVersion: '0.5.2', availableVersion: null })
    expect(
      await getUpdateStatus({
        runningVersion: '0.5.2',
        analysis: globalInstall,
        fetchLatest: async () => '0.6.0',
        detectManager: async () => null
      })
    ).toEqual({ runningVersion: '0.5.2', availableVersion: null })
  })

  test('reports an installable update', async () => {
    expect(
      await getUpdateStatus({
        runningVersion: '0.5.2',
        analysis: globalInstall,
        fetchLatest: async () => '0.6.0',
        detectManager: async () => 'bun'
      })
    ).toEqual({ runningVersion: '0.5.2', availableVersion: '0.6.0' })
  })

  test('installs and verifies an available update', async () => {
    const runs: string[][] = []
    const result = await installUpdate({
      runningVersion: '0.5.2',
      analysis: globalInstall,
      fetchLatest: async () => '0.6.0',
      detectManager: async () => 'bun',
      runManager: async argv => {
        runs.push(argv)
        return 0
      },
      readInstalledVersion: async () => '0.6.0'
    })

    expect(runs).toEqual([['bun', 'install', '-g', 'moi-computer@0.6.0']])
    expect(result).toEqual({ installedVersion: '0.6.0' })
  })

  test('surfaces package-manager and verification failures', async () => {
    const base = {
      runningVersion: '0.5.2',
      analysis: globalInstall,
      fetchLatest: async () => '0.6.0',
      detectManager: async () => 'bun' as const
    }

    await expect(installUpdate({ ...base, runManager: async () => 7 })).rejects.toThrow(
      'bun exited with code 7'
    )
    await expect(
      installUpdate({
        ...base,
        runManager: async () => 0,
        readInstalledVersion: async () => '0.5.2'
      })
    ).rejects.toThrow('reports v0.5.2 instead of v0.6.0')
  })

  test('shares one package-manager process across concurrent requests', async () => {
    let finish: ((code: number) => void) | null = null
    let runs = 0
    const runManager = () => {
      runs += 1
      return new Promise<number>(resolve => {
        finish = resolve
      })
    }
    const options = {
      runningVersion: '0.5.2',
      analysis: globalInstall,
      fetchLatest: async () => '0.6.0',
      detectManager: async () => 'bun' as const,
      runManager,
      readInstalledVersion: async () => '0.6.0'
    }

    const first = installUpdate(options)
    const second = installUpdate(options)
    expect(second).toBe(first)
    expect(runs).toBe(0)
    await Bun.sleep(0)
    expect(runs).toBe(1)
    finish?.(0)
    await Promise.all([first, second])
  })
})

// ---- cached status ----------------------------------------------------------

// A clock and an uptime the test drives by hand: the cache is all about when
// things happen, and nothing here should depend on the wall clock.
function clock(startUptimeMs = 10 * 60 * 1000) {
  let time = 1_700_000_000_000
  let uptime = startUptimeMs
  return {
    now: () => time,
    uptimeMs: () => uptime,
    advance(ms: number) {
      time += ms
      uptime += ms
    },
    rewind(ms: number) {
      time -= ms
    }
  }
}

describe('cached update status', () => {
  const globalInstall = {
    kind: 'global' as const,
    root: '/home/u/.bun/install/global/node_modules/moi-computer',
    bin: '/home/u/.bun/bin/moi'
  }
  const timings = {
    bootGraceMs: 60_000,
    cacheTtlMs: 60 * 60 * 1000,
    failureBackoffMs: 5 * 60 * 1000
  }

  afterEach(() => __resetUpdateStateForTests())

  // Every check that reaches the registry increments `checks`, so the
  // assertions below are all "how many times did we actually go out?".
  function checker(latest: () => string) {
    let checks = 0
    return {
      checks: () => checks,
      options: (time: ReturnType<typeof clock>) => ({
        runningVersion: '0.5.2',
        analysis: globalInstall,
        detectManager: async () => 'bun' as const,
        fetchLatest: async () => {
          checks += 1
          return latest()
        },
        now: time.now,
        uptimeMs: time.uptimeMs,
        timings
      })
    }
  }

  test('checks nothing during the boot grace window', async () => {
    const time = clock(0)
    const probe = checker(() => '0.6.0')

    expect(await getCachedUpdateStatus(probe.options(time))).toEqual({
      runningVersion: '0.5.2',
      availableVersion: null
    })
    expect(probe.checks()).toBe(0)

    // Reloading the page ten times inside the window must not compound it.
    for (let i = 0; i < 10; i++) await getCachedUpdateStatus(probe.options(time))
    expect(probe.checks()).toBe(0)

    time.advance(timings.bootGraceMs)
    expect(await getCachedUpdateStatus(probe.options(time))).toEqual({
      runningVersion: '0.5.2',
      availableVersion: '0.6.0'
    })
    expect(probe.checks()).toBe(1)
  })

  test('serves the cached answer for the whole TTL, then refreshes once', async () => {
    const time = clock()
    const probe = checker(() => '0.6.0')

    await getCachedUpdateStatus(probe.options(time))
    expect(probe.checks()).toBe(1)

    // A client polling every 5 minutes for an hour is still one registry hit.
    for (let i = 0; i < 11; i++) {
      time.advance(5 * 60 * 1000)
      await getCachedUpdateStatus(probe.options(time))
    }
    expect(probe.checks()).toBe(1)

    time.advance(5 * 60 * 1000)
    await getCachedUpdateStatus(probe.options(time))
    expect(probe.checks()).toBe(2)
  })

  test('retries a failed check on the short backoff, not the long TTL', async () => {
    const time = clock()
    let offline = true
    const probe = checker(() => {
      if (offline) throw new Error('offline')
      return '0.6.0'
    })

    expect(await getCachedUpdateStatus(probe.options(time))).toEqual({
      runningVersion: '0.5.2',
      availableVersion: null
    })
    expect(probe.checks()).toBe(1)

    // Polls inside the backoff window are absorbed — an offline machine must
    // not turn a 5-minute poll into a 5-minute retry storm.
    time.advance(60_000)
    await getCachedUpdateStatus(probe.options(time))
    time.advance(60_000)
    await getCachedUpdateStatus(probe.options(time))
    expect(probe.checks()).toBe(1)

    // Past the backoff the network is retried, long before the hour TTL.
    offline = false
    time.advance(timings.failureBackoffMs)
    expect(await getCachedUpdateStatus(probe.options(time))).toEqual({
      runningVersion: '0.5.2',
      availableVersion: '0.6.0'
    })
    expect(probe.checks()).toBe(2)
  })

  test('waking from sleep costs one check, not one per missed interval', async () => {
    const time = clock()
    const probe = checker(() => '0.6.0')

    await getCachedUpdateStatus(probe.options(time))
    expect(probe.checks()).toBe(1)

    // Eight hours asleep — eight TTLs missed, and no timer fired for any of
    // them. The first poll after waking does exactly one check.
    time.advance(8 * 60 * 60 * 1000)
    await getCachedUpdateStatus(probe.options(time))
    await getCachedUpdateStatus(probe.options(time))
    expect(probe.checks()).toBe(2)
  })

  test('a clock that jumped backwards does not pin the cache', async () => {
    const time = clock()
    const probe = checker(() => '0.6.0')

    await getCachedUpdateStatus(probe.options(time))
    expect(probe.checks()).toBe(1)

    // NTP correcting a laptop's clock after sleep leaves `attemptedAt` in the
    // future; treating that as fresh forever would strand the cache.
    time.rewind(24 * 60 * 60 * 1000)
    await getCachedUpdateStatus(probe.options(time))
    expect(probe.checks()).toBe(2)
  })

  test('concurrent callers share one registry request', async () => {
    const time = clock()
    const probe = checker(() => '0.6.0')

    const all = await Promise.all(
      Array.from({ length: 5 }, () => getCachedUpdateStatus(probe.options(time)))
    )

    expect(probe.checks()).toBe(1)
    for (const status of all) expect(status.availableVersion).toBe('0.6.0')
  })

  test('a completed install drops the cached availability', async () => {
    const time = clock()
    const probe = checker(() => '0.6.0')
    await getCachedUpdateStatus(probe.options(time))
    expect(probe.checks()).toBe(1)

    await installUpdate({
      runningVersion: '0.5.2',
      analysis: globalInstall,
      fetchLatest: async () => '0.6.0',
      detectManager: async () => 'bun',
      runManager: async () => 0,
      readInstalledVersion: async () => '0.6.0'
    })

    // The cached "0.6.0 available" is stale the moment it is installed.
    await getCachedUpdateStatus(probe.options(time))
    expect(probe.checks()).toBe(2)
  })

  test('probes the install location once per process', () => {
    expect(ownInstall()).toBe(ownInstall())
    expect(owningManager()).toBe(owningManager())
  })
})

// ---- install mutex and restart ----------------------------------------------

describe('install mutex', () => {
  afterEach(() => __resetUpdateStateForTests())

  test('reports an install in flight until it settles', async () => {
    let finish: ((code: number) => void) | null = null
    expect(updateInProgress()).toBe(false)

    const install = installUpdate({
      runningVersion: '0.5.2',
      analysis: {
        kind: 'global',
        root: '/home/u/.bun/install/global/node_modules/moi-computer',
        bin: '/home/u/.bun/bin/moi'
      },
      fetchLatest: async () => '0.6.0',
      detectManager: async () => 'bun',
      runManager: () => new Promise<number>(resolve => (finish = resolve)),
      readInstalledVersion: async () => '0.6.0'
    })

    await Bun.sleep(0)
    expect(updateInProgress()).toBe(true)
    finish?.(0)
    await install
    expect(updateInProgress()).toBe(true) // latched until the restart lands
  })

  test('schedules one restart however many callers ask', () => {
    // A delay no test run will reach: the timer is unref'd, and firing it would
    // SIGTERM the test process.
    const far = 2 ** 30
    expect(scheduleRestartForUpdate(far)).toBe(true)
    expect(scheduleRestartForUpdate(far)).toBe(false)
    expect(scheduleRestartForUpdate(far)).toBe(false)
  })
})

test('foreground supervision respawns only after an update exit', async () => {
  const exits = [UPDATE_RESTART_EXIT_CODE, UPDATE_RESTART_EXIT_CODE, 0]
  let respawns = 0
  const result = await superviseServerUpdates({ exited: Promise.resolve(exits[0]) }, () => ({
    exited: Promise.resolve(exits[++respawns])
  }))

  expect(result).toBe(0)
  expect(respawns).toBe(2)
})
