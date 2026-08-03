import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  LAUNCHD_LABEL,
  SERVICE_LOG_MAX_BYTES,
  analyzeInstall,
  captureServiceEnv,
  launchdPlist,
  parseUnitBin,
  rotateServiceLog,
  systemdUnit,
  type ServiceSpec
} from '../service'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'moi-service-test-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

// ---- analyzeInstall ---------------------------------------------------------

describe('analyzeInstall', () => {
  test('refuses a git checkout', () => {
    mkdirSync(join(dir, '.git'))
    mkdirSync(join(dir, 'dist'), { recursive: true })
    writeFileSync(join(dir, 'dist', 'index.html'), '<html/>')
    const res = analyzeInstall(dir, () => '/usr/local/bin/moi')
    expect(res.kind).toBe('checkout')
    if (res.kind === 'checkout') expect(res.reason).toContain('git checkout')
  })

  test('refuses a tree without a prebuilt client', () => {
    const res = analyzeInstall(dir, () => '/usr/local/bin/moi')
    expect(res.kind).toBe('checkout')
    if (res.kind === 'checkout') expect(res.reason).toContain('dist/')
  })

  test('flags a missing bin separately', () => {
    mkdirSync(join(dir, 'dist'), { recursive: true })
    writeFileSync(join(dir, 'dist', 'index.html'), '<html/>')
    expect(analyzeInstall(dir, () => null).kind).toBe('no-bin')
  })

  test('accepts a published global install', () => {
    mkdirSync(join(dir, 'dist'), { recursive: true })
    writeFileSync(join(dir, 'dist', 'index.html'), '<html/>')
    const res = analyzeInstall(dir, () => '/home/u/.bun/bin/moi')
    expect(res).toEqual({ kind: 'global', root: dir, bin: '/home/u/.bun/bin/moi' })
  })
})

// ---- captureServiceEnv ------------------------------------------------------

describe('captureServiceEnv', () => {
  const base = {
    PATH: '/usr/bin:/bin',
    HOME: '/home/u',
    ANTHROPIC_API_KEY: 'sk-test',
    // Per-terminal noise that must not be captured.
    TERM: 'xterm-256color',
    PWD: '/somewhere',
    SHLVL: '3',
    TMUX: '/tmp/tmux-1000/default,123,0',
    XDG_SESSION_ID: '42',
    XDG_RUNTIME_DIR: '/run/user/1000',
    DBUS_SESSION_BUS_ADDRESS: 'unix:path=/run/user/1000/bus',
    // Generic names that would redirect the server bind (zsh exports HOST).
    HOST: 'my-laptop.local',
    HOSTNAME: 'my-laptop',
    PORT: '9999',
    // Runtime flags the unit owns.
    MOI_DEV: '1',
    MOI_SERVER: '1'
  }

  test('captures real vars, drops noise and dangerous generics', () => {
    const env = captureServiceEnv(base, '/home/u/.bun/bin')
    expect(env.ANTHROPIC_API_KEY).toBe('sk-test')
    expect(env.HOME).toBe('/home/u')
    for (const key of [
      'TERM',
      'PWD',
      'SHLVL',
      'TMUX',
      'XDG_SESSION_ID',
      'XDG_RUNTIME_DIR',
      'DBUS_SESSION_BUS_ADDRESS',
      'HOST',
      'HOSTNAME',
      'PORT',
      'MOI_DEV'
    ]) {
      expect(env).not.toHaveProperty(key)
    }
  })

  test('marks the process as the service-managed server', () => {
    const env = captureServiceEnv(base, '/x')
    expect(env.MOI_SERVER).toBe('1')
    expect(env.MOI_SERVICE).toBe('1')
  })

  test('prepends the running bun dir to PATH and dedupes', () => {
    const env = captureServiceEnv(base, '/home/u/.bun/bin')
    expect(env.PATH).toBe('/home/u/.bun/bin:/usr/bin:/bin')
    expect(captureServiceEnv({ PATH: '/a:/a:/b' }, '/a').PATH).toBe('/a:/b')
  })

  test('drops multiline values and invalid keys', () => {
    const env = captureServiceEnv({ PATH: '/bin', WEIRD: 'a\nb', 'BAD-KEY': 'x', OK: 'fine' }, '/x')
    expect(env).not.toHaveProperty('WEIRD')
    expect(env).not.toHaveProperty('BAD-KEY')
    expect(env.OK).toBe('fine')
  })
})

// ---- unit file generation ---------------------------------------------------

const spec: ServiceSpec = {
  bin: '/home/u/.bun/bin/moi',
  env: {
    PATH: '/home/u/.bun/bin:/usr/bin',
    MOI_SERVER: '1',
    MOI_SERVICE: '1',
    TRICKY: 'a"b\\c%d & <e>'
  },
  cwd: '/home/u',
  logPath: '/home/u/.local/share/moi/logs/server.log'
}

describe('launchdPlist', () => {
  const plist = launchdPlist(spec)

  test('execs the moi bin directly with start', () => {
    expect(plist).toContain(
      '<key>ProgramArguments</key>\n\t<array>\n\t\t<string>/home/u/.bun/bin/moi</string>\n\t\t<string>start</string>'
    )
  })

  test('restarts on crash but not after a deliberate clean exit', () => {
    expect(plist).toContain('<key>KeepAlive</key>')
    expect(plist).toContain('<key>SuccessfulExit</key>\n\t\t<false/>')
    expect(plist).toContain('<key>RunAtLoad</key>\n\t<true/>')
  })

  test('captures env with XML escaping', () => {
    expect(plist).toContain('<key>TRICKY</key>')
    expect(plist).toContain('<string>a"b\\c%d &amp; &lt;e&gt;</string>')
  })

  test('redirects stdout and stderr to the log file', () => {
    expect(plist).toContain(`<key>StandardOutPath</key>\n\t<string>${spec.logPath}</string>`)
    expect(plist).toContain(`<key>StandardErrorPath</key>\n\t<string>${spec.logPath}</string>`)
  })

  test('uses the stable label and a neutral working directory', () => {
    expect(plist).toContain(`<string>${LAUNCHD_LABEL}</string>`)
    expect(plist).toContain('<key>WorkingDirectory</key>\n\t<string>/home/u</string>')
  })
})

describe('systemdUnit', () => {
  const unit = systemdUnit(spec)

  test('execs the moi bin directly with start', () => {
    expect(unit).toContain('ExecStart="/home/u/.bun/bin/moi" start')
  })

  test('restarts on failure with a start limit instead of looping forever', () => {
    expect(unit).toContain('Restart=on-failure')
    expect(unit).toContain('StartLimitIntervalSec=60')
    expect(unit).toContain('StartLimitBurst=5')
    expect(unit).toContain('RestartSec=2')
  })

  test('escapes env values for systemd quoting rules', () => {
    // `\` doubles, `"` escapes, `%` doubles (specifier expansion).
    expect(unit).toContain('Environment="TRICKY=a\\"b\\\\c%%d & <e>"')
  })

  test('starts on login via default.target and stops cleanly', () => {
    expect(unit).toContain('WantedBy=default.target')
    expect(unit).toContain('TimeoutStopSec=10')
  })
})

describe('parseUnitBin', () => {
  test('round-trips the exec path out of both formats', () => {
    expect(parseUnitBin(launchdPlist(spec), 'darwin')).toBe(spec.bin)
    expect(parseUnitBin(systemdUnit(spec), 'linux')).toBe(spec.bin)
  })

  test('round-trips a path needing escaping', () => {
    const odd: ServiceSpec = { ...spec, bin: '/od d/10%/m&oi' }
    expect(parseUnitBin(launchdPlist(odd), 'darwin')).toBe(odd.bin)
    expect(parseUnitBin(systemdUnit(odd), 'linux')).toBe(odd.bin)
  })

  test('returns null on unrecognized content', () => {
    expect(parseUnitBin('not a unit', 'darwin')).toBeNull()
    expect(parseUnitBin('not a unit', 'linux')).toBeNull()
  })
})

// ---- log rotation -----------------------------------------------------------

describe('rotateServiceLog', () => {
  test('copies then truncates once past the cap', async () => {
    const log = join(dir, 'server.log')
    writeFileSync(log, 'x'.repeat(SERVICE_LOG_MAX_BYTES + 1))
    expect(await rotateServiceLog(log)).toBe(true)
    expect((await Bun.file(log).arrayBuffer()).byteLength).toBe(0)
    expect((await Bun.file(log + '.old').arrayBuffer()).byteLength).toBe(SERVICE_LOG_MAX_BYTES + 1)
  })

  test('leaves a small log alone', async () => {
    const log = join(dir, 'server.log')
    writeFileSync(log, 'small')
    expect(await rotateServiceLog(log)).toBe(false)
    expect(await Bun.file(log).text()).toBe('small')
  })

  test('is a no-op when the log does not exist', async () => {
    expect(await rotateServiceLog(join(dir, 'nope.log'))).toBe(false)
  })
})
