// End-to-end tests for the `moi env` CLI: each test spawns the real CLI
// (`bun server/cli.ts env …`) against a temp workspace, with the registry and
// env stores isolated under a temp XDG_DATA_HOME. MOI_SECRET_BACKEND=file pins
// the file secret store so a test run can never touch the real OS keychain.
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'path'

const CLI = join(import.meta.dir, '..', 'cli.ts')

let dataHome: string
let wsDir: string
let outsideDir: string

// The stores keyed by env-paths land in $XDG_DATA_HOME/moi on Linux and
// $XDG_DATA_HOME/moi (via env-paths override) elsewhere too, because env-paths
// honors XDG_DATA_HOME on every platform when set.
const moiDataDir = () => join(dataHome, 'moi')
const secretsPath = () => join(moiDataDir(), 'workspace-secrets.json')

async function registerWorkspace(path: string) {
  await mkdir(moiDataDir(), { recursive: true })
  await writeFile(
    join(moiDataDir(), 'workspaces.json'),
    JSON.stringify([{ id: 'ws-test', path, addedAt: new Date().toISOString() }])
  )
}

type CliResult = { code: number; stdout: string; stderr: string }

async function runCli(
  args: string[],
  opts: { cwd?: string; stdin?: string } = {}
): Promise<CliResult> {
  const proc = Bun.spawn(['bun', CLI, 'env', ...args], {
    cwd: opts.cwd ?? wsDir,
    stdin: opts.stdin !== undefined ? new Response(opts.stdin) : 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      ...process.env,
      XDG_DATA_HOME: dataHome,
      MOI_SECRET_BACKEND: 'file',
      // No NO_COLOR override: stdout is a pipe here, exactly like an agent
      // capturing the command, so plain output must be the default.
      NO_COLOR: undefined,
      FORCE_COLOR: undefined
    }
  })
  const [code, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text()
  ])
  return { code, stdout, stderr }
}

async function storedSecrets(): Promise<Record<string, Record<string, string>>> {
  try {
    return JSON.parse(await Bun.file(secretsPath()).text())
  } catch {
    return {}
  }
}

beforeEach(async () => {
  dataHome = await mkdtemp(join(tmpdir(), 'moi-cli-data-'))
  wsDir = await mkdtemp(join(tmpdir(), 'moi-cli-ws-'))
  outsideDir = await mkdtemp(join(tmpdir(), 'moi-cli-outside-'))
  await registerWorkspace(wsDir)
})

afterEach(async () => {
  for (const dir of [dataHome, wsDir, outsideDir]) {
    await rm(dir, { recursive: true, force: true })
  }
})

describe('workspace resolution', () => {
  test('errors outside any registered workspace', async () => {
    const res = await runCli([], { cwd: outsideDir })
    expect(res.code).toBe(1)
    expect(res.stderr).toContain('not inside a registered moi workspace')
  })

  test('resolves from a subdirectory of the workspace', async () => {
    const sub = join(wsDir, '.moi', 'widgets')
    await mkdir(sub, { recursive: true })
    const res = await runCli([], { cwd: sub })
    expect(res.code).toBe(0)
    expect(res.stdout).toContain('Workspace:')
  })
})

describe('moi env (list)', () => {
  test('shows .env keys with their file and never values', async () => {
    await writeFile(join(wsDir, '.env'), 'NOTION_TOKEN=secret-notion\nDB_URL=postgres://x\n')
    const res = await runCli([])
    expect(res.code).toBe(0)
    expect(res.stdout).toContain('NOTION_TOKEN')
    expect(res.stdout).toContain('.env')
    expect(res.stdout).toContain('inherited: on')
    expect(res.stdout).not.toContain('secret-notion')
    expect(res.stdout).not.toContain('postgres://x')
  })

  test('piped output carries no ANSI color escapes', async () => {
    await writeFile(join(wsDir, '.env'), 'A=1\n')
    const res = await runCli([])
    // stdout is a pipe (the agent-capture case) — coloring must no-op.
    // eslint-disable-next-line no-control-regex
    const ansi = /\x1b\[/
    expect(res.stdout).not.toMatch(ansi)
    expect(res.stderr).not.toMatch(ansi)
  })

  test('flags disabled .env inheritance but still lists files', async () => {
    await writeFile(join(wsDir, '.env'), 'A=1\n')
    await mkdir(moiDataDir(), { recursive: true })
    await writeFile(
      join(moiDataDir(), 'workspace-env.json'),
      JSON.stringify({ [wsDir]: { inheritDotenv: false } })
    )
    const res = await runCli([])
    expect(res.code).toBe(0)
    expect(res.stdout).toContain('inherited: off')
    expect(res.stdout).toContain('.env')
    // Not injected → the key must not appear in the vars table.
    expect(res.stdout).not.toMatch(/^A\s/m)
  })

  test('empty workspace prints a hint', async () => {
    const res = await runCli([])
    expect(res.code).toBe(0)
    expect(res.stdout).toContain('No env vars')
  })
})

describe('moi env set / unset', () => {
  test('set KEY=value stores a custom secret without echoing it', async () => {
    const res = await runCli(['set', 'API_KEY=sk-12345'])
    expect(res.code).toBe(0)
    expect(res.stdout).toContain('Set API_KEY')
    expect(res.stdout).not.toContain('sk-12345')
    expect((await storedSecrets())[wsDir]).toEqual({ API_KEY: 'sk-12345' })

    const list = await runCli([])
    expect(list.stdout).toContain('API_KEY')
    expect(list.stdout).toContain('custom')
  })

  test('value may contain = characters', async () => {
    await runCli(['set', 'TOKEN=abc=def=='])
    expect((await storedSecrets())[wsDir]).toEqual({ TOKEN: 'abc=def==' })
  })

  test('bare KEY reads the value from stdin and trims one trailing newline', async () => {
    const res = await runCli(['set', 'PIPED_KEY'], { stdin: 'from-stdin\n' })
    expect(res.code).toBe(0)
    expect((await storedSecrets())[wsDir]).toEqual({ PIPED_KEY: 'from-stdin' })
  })

  test('rejects an invalid key', async () => {
    const res = await runCli(['set', '1BAD=x'])
    expect(res.code).toBe(1)
    expect(res.stderr).toContain('Invalid env key')
  })

  test('rejects an empty value (KEY= and empty stdin)', async () => {
    const inline = await runCli(['set', 'TOKEN='])
    expect(inline.code).toBe(1)
    expect(inline.stderr).toContain('Empty value')

    // Agent running `moi env set KEY` with no pipe (stdin /dev/null) must not
    // silently store '' — it would shadow a real .env value with nothing.
    const piped = await runCli(['set', 'TOKEN'], { stdin: '' })
    expect(piped.code).toBe(1)
    expect(piped.stderr).toContain('Empty value')
    expect(await storedSecrets()).toEqual({})
  })

  test('sets multiple KEY=value pairs in one invocation', async () => {
    const res = await runCli(['set', 'A=1', 'B=2'])
    expect(res.code).toBe(0)
    expect(res.stdout).toContain('Set A')
    expect(res.stdout).toContain('Set B')
    expect((await storedSecrets())[wsDir]).toEqual({ A: '1', B: '2' })

    // Bare KEY (stdin form) is only valid alone.
    const mixed = await runCli(['set', 'C=3', 'D'])
    expect(mixed.code).toBe(1)
    expect(mixed.stderr).toContain('Missing value')
  })

  test('warns when secrets land in the file backend', async () => {
    const res = await runCli(['set', 'K=v'])
    expect(res.code).toBe(0)
    expect(res.stdout).toContain('0600 file')
  })

  test('custom secret shadows .env and unset un-shadows it', async () => {
    await writeFile(join(wsDir, '.env'), 'TOKEN=from-dotenv\n')
    await runCli(['set', 'TOKEN=from-cli'])

    const list = await runCli([])
    expect(list.stdout).toContain('overrides .env')

    const unset = await runCli(['unset', 'TOKEN'])
    expect(unset.code).toBe(0)
    expect(unset.stdout).toContain('Removed TOKEN')
    expect(unset.stdout).toContain('falls back to .env')
    expect((await storedSecrets())[wsDir]).toBeUndefined()
  })

  test('unset refuses dotenv-sourced keys with a pointer to the file', async () => {
    await writeFile(join(wsDir, '.env'), 'FILE_KEY=x\n')
    const res = await runCli(['unset', 'FILE_KEY'])
    expect(res.code).toBe(1)
    expect(res.stderr).toContain('comes from .env')
  })

  test('unset warns on unknown keys without failing', async () => {
    const res = await runCli(['unset', 'NEVER_SET'])
    expect(res.code).toBe(0)
    expect(res.stderr).toContain('not set')
  })
})

describe('moi env exec', () => {
  test('injects .env and custom secrets, custom wins', async () => {
    await writeFile(join(wsDir, '.env'), 'FROM_ENV=dotenv\nSHADOWED=dotenv\n')
    await runCli(['set', 'SHADOWED=custom'])
    const res = await runCli([
      'exec',
      '--',
      'bun',
      '-e',
      'console.log(process.env.FROM_ENV, process.env.SHADOWED)'
    ])
    expect(res.code).toBe(0)
    expect(res.stdout.trim()).toBe('dotenv custom')
  })

  test('workspace env overrides the inherited process env', async () => {
    await writeFile(join(wsDir, '.env'), 'HOME_MADE=fresh\n')
    const proc = Bun.spawn(
      ['bun', CLI, 'env', 'exec', '--', 'bun', '-e', 'console.log(process.env.HOME_MADE)'],
      {
        cwd: wsDir,
        stdout: 'pipe',
        stderr: 'pipe',
        env: {
          ...process.env,
          XDG_DATA_HOME: dataHome,
          MOI_SECRET_BACKEND: 'file',
          NO_COLOR: '1',
          HOME_MADE: 'stale'
        }
      }
    )
    await proc.exited
    expect((await new Response(proc.stdout).text()).trim()).toBe('fresh')
  })

  test('does not leak auto-loaded .env values when inheritance is off', async () => {
    // Bun auto-loads the workspace .env into the CLI process itself (cwd is
    // the workspace root), so exec must scrub dotenv keys from the inherited
    // env and let the resolution decide what applies. The child here is `sh`,
    // not `bun` — a Bun child re-reads .env off disk on its own, which exec
    // cannot prevent (documented caveat; the function worker dodges it with
    // its neutral-cwd spawn).
    await writeFile(join(wsDir, '.env'), 'LEAK_TEST=from-dotenv\n')
    await mkdir(moiDataDir(), { recursive: true })
    await writeFile(
      join(moiDataDir(), 'workspace-env.json'),
      JSON.stringify({ [wsDir]: { inheritDotenv: false } })
    )
    const res = await runCli(['exec', '--', 'sh', '-c', 'echo "${LEAK_TEST:-unset}"'])
    expect(res.code).toBe(0)
    expect(res.stdout.trim()).toBe('unset')
  })

  test('propagates the child exit code', async () => {
    const res = await runCli(['exec', '--', 'bun', '-e', 'process.exit(3)'])
    expect(res.code).toBe(3)
  })

  test('requires -- and a command', async () => {
    const res = await runCli(['exec'])
    expect(res.code).toBe(1)
    expect(res.stderr).toContain('Usage: moi env exec')
  })
})
