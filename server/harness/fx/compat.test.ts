import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { chmod, mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { checkFxVersion, fxVersionAvailability } from './compat'

let tempDir: string

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'moi-fx-compat-'))
})

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true })
})

async function executable(code: string): Promise<string> {
  const command = join(tempDir, 'fx')
  await Bun.write(command, `#!${process.execPath}\n${code}\n`)
  await chmod(command, 0o755)
  return command
}

describe('fx minimum version', () => {
  test.each(['0.0.8', '0.0.9-rc.1', '0.0.8+newer-build'])(
    'rejects %s with an upgrade instruction',
    version => {
      expect(fxVersionAvailability(version)).toEqual({
        status: 'unavailable',
        reason: `moi requires fx 0.0.9 or later. Found fx ${version}. Run fx upgrade.`
      })
    }
  )

  test.each(['0.0.9', '0.0.9+build.123', '0.0.10-rc.1', '0.1.0', '1.0.0', ' 0.0.9\n'])(
    'accepts %s',
    version => {
      expect(fxVersionAvailability(version)).toEqual({ status: 'available' })
    }
  )

  test.each(['', 'fx 0.0.9', '0.0', '0.0.9\n0.0.10', '00.0.9', '0.0.9+..', '0.0.10-01'])(
    'does not infer compatibility from malformed output %j',
    output => {
      expect(fxVersionAvailability(output)).toEqual({
        status: 'unavailable',
        reason:
          'Could not check the fx version. Run fx --version in your terminal and reopen this chat.'
      })
    }
  )
})

describe('fx version process', () => {
  test('runs --version in the supplied workspace with auto-upgrade disabled', async () => {
    const capture = join(tempDir, 'version-call.json')
    const command = await executable(`
await Bun.write(process.env.FX_COMPAT_CAPTURE, JSON.stringify({
  args: process.argv.slice(2),
  cwd: process.cwd(),
  autoUpgrade: process.env.FX_AUTO_UPGRADE,
  workspaceValue: process.env.FX_COMPAT_WORKSPACE_VALUE
}))
console.log('0.0.9')
`)
    expect(
      await checkFxVersion(command, {
        cwd: tempDir,
        env: {
          FX_COMPAT_CAPTURE: capture,
          FX_COMPAT_WORKSPACE_VALUE: 'workspace-specific',
          FX_AUTO_UPGRADE: '1'
        }
      })
    ).toEqual({ status: 'available' })
    expect(await Bun.file(capture).json()).toEqual({
      args: ['--version'],
      // macOS resolves /var to /private/var when entering the child cwd.
      cwd: await realpath(tempDir),
      autoUpgrade: '0',
      workspaceValue: 'workspace-specific'
    })
  })

  test('rejects a failed CLI even when stdout contains a supported version', async () => {
    const command = await executable("console.log('0.0.9'); process.exit(1)")
    expect(await checkFxVersion(command)).toMatchObject({ status: 'unavailable' })
    expect(await checkFxVersion(join(tempDir, 'missing'))).toMatchObject({
      status: 'unavailable'
    })
  })

  test('terminates a CLI that hangs instead of printing its version', async () => {
    const command = await executable('setInterval(() => {}, 1_000)')
    const started = Date.now()
    expect(await checkFxVersion(command, { timeoutMs: 100 })).toMatchObject({
      status: 'unavailable'
    })
    expect(Date.now() - started).toBeLessThan(2_000)
  })

  test('rechecks an executable replaced at the same path', async () => {
    const command = await executable("console.log('0.0.8')")
    expect(await checkFxVersion(command)).toMatchObject({ status: 'unavailable' })
    await executable("console.log('0.0.9')")
    expect(await checkFxVersion(command)).toEqual({ status: 'available' })
    await executable("console.log('0.0.8')")
    expect(await checkFxVersion(command)).toMatchObject({ status: 'unavailable' })
  })

  test('blocks an old executable before workspace setup or ACP startup', async () => {
    const capture = join(tempDir, 'calls.jsonl')
    const command = await executable(`
const capture = Bun.file(process.env.FX_COMPAT_CAPTURE)
const previous = await capture.exists() ? await capture.text() : ''
await Bun.write(capture, previous + JSON.stringify(process.argv.slice(2)) + '\\n')
console.log('0.0.8')
`)
    // Isolate executable lookup and harness module initialization from the
    // rest of the suite. The actual version subprocess remains unmocked.
    const script = `
const originalWhich = Bun.which
Bun.which = (name, options) => name === 'fx'
  ? process.env.FX_COMPAT_EXECUTABLE
  : originalWhich(name, options)
await import(${JSON.stringify(resolve(import.meta.dir, '../registry.ts'))})
const { fxHarness, fxConfig } = await import(${JSON.stringify(resolve(import.meta.dir, 'index.ts'))})
const availability = await fxHarness.availability()
let spawnError = null
try {
  await fxConfig.spawn({ workspaceId: 'version-test', workspacePath: process.env.FX_COMPAT_WORKSPACE })
} catch (error) {
  spawnError = error.message
}
console.log(JSON.stringify({ availability, spawnError }))
process.exit(0)
`
    const proc = Bun.spawn([process.execPath, '--eval', script], {
      cwd: resolve(import.meta.dir, '../../..'),
      env: {
        ...process.env,
        MOI_DATA_DIR: join(tempDir, 'moi-data'),
        FX_COMPAT_EXECUTABLE: command,
        FX_COMPAT_CAPTURE: capture,
        FX_COMPAT_WORKSPACE: tempDir
      },
      stdout: 'pipe',
      stderr: 'pipe'
    })
    const [output, errors, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited
    ])
    expect({ code, errors }).toEqual({ code: 0, errors: '' })
    expect(JSON.parse(output)).toEqual({
      availability: {
        status: 'unavailable',
        reason: 'moi requires fx 0.0.9 or later. Found fx 0.0.8. Run fx upgrade.'
      },
      spawnError: 'moi requires fx 0.0.9 or later. Found fx 0.0.8. Run fx upgrade.'
    })
    expect(
      (await Bun.file(capture).text())
        .trim()
        .split('\n')
        .map(line => JSON.parse(line))
    ).toEqual([['--version'], ['--version']])
  })
})
