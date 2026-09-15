import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { chmod, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CLI = join(import.meta.dir, '..', 'cli.ts')
let directory: string
let workspace: string
let capturePath: string
let env: Record<string, string | undefined>
const children: ReturnType<typeof Bun.spawn>[] = []

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'moi-cli-collab-'))
  workspace = join(directory, 'workspace')
  capturePath = join(directory, 'server-env.json')
  await mkdir(join(workspace, '.moi'), { recursive: true })
  await Bun.write(join(workspace, '.moi', 'package.json'), '{}\n')
  const bin = join(directory, 'bin')
  await mkdir(bin)
  // The real CLI runs under process.execPath. Its spawned server goes through
  // this stub so we can assert the launch boundary without starting moi.
  await Bun.write(
    join(bin, 'bun'),
    '#!/bin/sh\n' +
      `printf '{"enabled":"%s","dev":"%s","server":"%s"}\\n' "$MOI_EXPERIMENTAL_COLLAB" "$MOI_DEV" "$MOI_SERVER" > "$COLLAB_CAPTURE_PATH"\n`
  )
  await chmod(join(bin, 'bun'), 0o755)
  env = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH ?? ''}`,
    MOI_DATA_DIR: join(directory, 'data'),
    // Never probe the user's running server during CLI tests.
    MOI_CONTROL_PORT: '1',
    MOI_SERVER: undefined,
    MOI_SERVICE: undefined,
    MOI_CLOUD_DEMO: undefined,
    MOI_DEV: undefined,
    // Neither a legacy flag nor an inherited child marker enables plain start.
    MOI_COLLAB: '1',
    MOI_EXPERIMENTAL_COLLAB: '1',
    COLLAB_CAPTURE_PATH: capturePath,
    NO_COLOR: '1'
  }
})

afterEach(async () => {
  for (const child of children.splice(0)) {
    if (child.exitCode === null) child.kill('SIGTERM')
    await child.exited
  }
  await rm(directory, { recursive: true, force: true })
})

function spawnCli(args: string[]) {
  const child = Bun.spawn([process.execPath, CLI, ...args], {
    cwd: workspace,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    env
  })
  children.push(child)
  return child
}

async function runCli(args: string[]) {
  const child = spawnCli(args)
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text()
  ])
  return { code, stdout, stderr }
}

async function capturedServerEnv(): Promise<{ enabled: string; dev: string; server: string }> {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const file = Bun.file(capturePath)
    if (await file.exists()) {
      const value = await file.text()
      if (value.endsWith('\n')) return JSON.parse(value)
    }
    await Bun.sleep(20)
  }
  throw new Error('The CLI did not launch its server child')
}

describe('collab runtime CLI flag', () => {
  for (const dev of [false, true]) {
    for (const enabled of [false, true]) {
      const args = [
        'start',
        ...(dev ? ['--dev'] : []),
        ...(enabled ? ['--experimental-collab'] : [])
      ]
      test(`${args.join(' ')} sets the child runtime explicitly`, async () => {
        const child = spawnCli(args)
        expect(await capturedServerEnv()).toEqual({
          enabled: enabled ? '1' : '0',
          dev: dev ? '1' : '',
          server: '1'
        })
        if (dev) child.kill('SIGTERM')
        expect(await child.exited).toBe(0)
      }, 15_000)
    }
  }
})

describe('collab init CLI flag', () => {
  test('plain init omits the guide; flagged init adds it and plain refresh preserves it', async () => {
    const args = ['init', '--harness=codex']
    const guide = join(
      workspace,
      '.agents',
      'skills',
      'moi-workspace',
      'references',
      'COLLABORATIVE.md'
    )
    const types = join(workspace, '.moi', 'collab-env.d.ts')
    expect((await runCli(args)).code).toBe(0)
    expect(await Bun.file(guide).exists()).toBe(false)
    expect(await Bun.file(types).exists()).toBe(false)
    const initialized = await runCli([...args, '--experimental-collab'])
    expect(initialized.code).toBe(0)
    expect(initialized.stdout).toContain('Collaboration guide installed')
    expect(await Bun.file(guide).exists()).toBe(true)
    expect(await Bun.file(types).exists()).toBe(true)
    expect(await Bun.file(capturePath).exists()).toBe(false)
    expect((await runCli(args)).code).toBe(0)
    expect(await Bun.file(guide).exists()).toBe(true)
    expect(await Bun.file(types).exists()).toBe(true)
  }, 30_000)

  test('init --web --experimental-collab installs docs without enabling the runtime', async () => {
    spawnCli(['init', '--harness=codex', '--web', '--experimental-collab'])
    expect((await capturedServerEnv()).enabled).toBe('0')
    expect(await Bun.file(join(workspace, '.moi', 'collab-env.d.ts')).exists()).toBe(true)
  }, 15_000)

  test('both commands explain their separate flags in help', async () => {
    const start = await runCli(['start', '--help'])
    expect(start.code).toBe(0)
    expect(start.stdout).toContain('--experimental-collab')
    expect(start.stdout).toContain('no identity or workspace UI')
    const init = await runCli(['init', '--help'])
    expect(init.code).toBe(0)
    expect(init.stdout).toContain('--experimental-collab')
    expect(init.stdout).toContain('guide and applet types')
  }, 15_000)
})
