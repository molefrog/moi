// End-to-end `moi service` against a fake global install: the CLI refusals,
// the Linux no-user-manager error, and the status rendering — everything that
// can run without a real launchd/systemd session. (Unit-file generation and
// env capture are covered in service.test.ts.)
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { systemdUnit } from '../service'

const REPO_ROOT = join(import.meta.dir, '..', '..')

let home: string
let fakeRoot: string

beforeAll(async () => {
  home = await mkdtemp(join(tmpdir(), 'moi-service-e2e-'))
  fakeRoot = join(home, '.bun', 'install', 'global', 'node_modules', 'moi-computer')
  await mkdir(fakeRoot, { recursive: true })
  for (const entry of ['server', 'lib', 'package.json', 'bunfig.toml', 'tsconfig.json', 'bin']) {
    await cp(join(REPO_ROOT, entry), join(fakeRoot, entry), { recursive: true })
  }
  await mkdir(join(fakeRoot, 'dist'), { recursive: true })
  await writeFile(join(fakeRoot, 'dist', 'index.html'), '<html></html>')
  await symlink(join(REPO_ROOT, 'node_modules'), join(fakeRoot, 'node_modules'))
  await mkdir(join(home, '.bun', 'bin'), { recursive: true })
  await symlink(
    join('..', 'install', 'global', 'node_modules', 'moi-computer', 'bin', 'moi.mjs'),
    join(home, '.bun', 'bin', 'moi')
  )
}, 60_000)

afterAll(async () => {
  await rm(home, { recursive: true, force: true })
})

type CliResult = { code: number; stdout: string; stderr: string }

async function runCli(args: string[], envExtra: Record<string, string> = {}): Promise<CliResult> {
  const proc = Bun.spawn(['bun', join(fakeRoot, 'server', 'cli.ts'), ...args], {
    cwd: fakeRoot,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      ...process.env,
      HOME: home,
      XDG_CONFIG_HOME: join(home, '.config'),
      MOI_DATA_DIR: join(home, 'moi-data'),
      PATH: `${join(home, '.bun', 'bin')}:${process.env.PATH}`,
      NO_COLOR: '1',
      ...envExtra
    }
  })
  const [code, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text()
  ])
  return { code, stdout, stderr }
}

const unitPath = () => join(home, '.config', 'systemd', 'user', 'moi.service')

// These tests exercise the Linux paths; the sandbox they run in has no systemd
// user manager, which is exactly the environment the errors are written for.
const linuxOnly = process.platform === 'linux' ? test : test.skip

describe('moi service (e2e)', () => {
  test('status: not installed', async () => {
    const res = await runCli(['service'])
    expect(res.code).toBe(0)
    expect(res.stdout).toContain('Not installed')
    expect(res.stdout).toContain('moi service install')
  })

  linuxOnly('install: clear error without a systemd user manager', async () => {
    const res = await runCli(['service', 'install'])
    expect(res.code).toBe(1)
    expect(res.stderr).toContain('No systemd user manager is running')
    expect(res.stderr).toContain('enable-linger')
    // Nothing half-installed left behind.
    expect(await Bun.file(unitPath()).exists()).toBe(false)
  })

  test('install: rejects a bad --port before touching anything', async () => {
    const res = await runCli(['service', 'install', '--port', 'nope'])
    expect(res.code).toBe(1)
    expect(res.stderr).toContain('Invalid --port')
  })

  test('install: --env with an unset var fails with the var named', async () => {
    const res = await runCli(['service', 'install', '--env', 'DEFINITELY_UNSET_VAR_42'])
    expect(res.code).toBe(1)
    expect(res.stderr).toContain('DEFINITELY_UNSET_VAR_42')
    expect(res.stderr).toContain('not set in this shell')
    expect(await Bun.file(unitPath()).exists()).toBe(false)
  })

  linuxOnly('restart: not installed yet', async () => {
    const res = await runCli(['service', 'restart'])
    expect(res.code).toBe(1)
    expect(res.stderr).toContain('not installed')
  })

  linuxOnly('status: installed unit renders state and flags a stale bin', async () => {
    await mkdir(join(home, '.config', 'systemd', 'user'), { recursive: true })
    await writeFile(
      unitPath(),
      systemdUnit({
        bin: join(home, 'gone', 'moi'),
        env: { PATH: '/usr/bin', MOI_SERVER: '1', MOI_SERVICE: '1' },
        cwd: home,
        logPath: join(home, 'server.log')
      })
    )
    const res = await runCli(['service'])
    expect(res.code).toBe(0)
    expect(res.stdout).toContain('unit')
    expect(res.stdout).toContain('systemd user unit')
    // No user manager in the sandbox: state is reported as unavailable, not a
    // crash or a raw dbus error dump.
    expect(res.stdout).toContain('unavailable')
    expect(res.stdout).not.toMatch(/Failed to connect to bus/)
    // The unit's exec no longer exists → stale-bin warning with the fix.
    expect(res.stdout).toContain('no longer exists')
    expect(res.stdout).toContain('moi service install')
    await rm(unitPath())
  })

  linuxOnly('uninstall: removes the unit even without a user manager', async () => {
    await mkdir(join(home, '.config', 'systemd', 'user'), { recursive: true })
    await writeFile(unitPath(), 'stub')
    const res = await runCli(['service', 'uninstall'])
    expect(res.code).toBe(0)
    expect(res.stdout).toContain('Service removed')
    expect(await Bun.file(unitPath()).exists()).toBe(false)
  })

  test('uninstall: reports when nothing is installed', async () => {
    const res = await runCli(['service', 'uninstall'])
    expect(res.code).toBe(0)
    expect(res.stdout).toContain('not installed')
  })
})
