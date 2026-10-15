// E2e for the agent's `moi` CLI on a managed machine: the agent runs as its own
// OS user and can't open moi's data folder. Simulated here with a data folder
// this test process can't open. System commands are refused, `version` still
// works, and `moi env` goes to the server (none runs here, so it says so).
import { afterAll, beforeAll, expect, test } from 'bun:test'
import { chmod, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'path'

const CLI = join(import.meta.dir, '..', 'cli.ts')
// Spawns are cold Bun starts of the whole CLI graph; see cli-demo.test.ts.
const SPAWN_TIMEOUT = 30_000
// Root opens any folder, so the simulation needs a regular user.
const asRoot = process.getuid?.() === 0

let closedDataDir: string

beforeAll(async () => {
  closedDataDir = await mkdtemp(join(tmpdir(), 'moi-cli-managed-'))
  await chmod(closedDataDir, 0o000)
})

afterAll(async () => {
  await chmod(closedDataDir, 0o700)
})

async function runCli(args: string[]) {
  const proc = Bun.spawn(['bun', CLI, ...args], {
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      ...process.env,
      MOI_DATA_DIR: closedDataDir,
      MOI_SERVER: undefined,
      // An unused control port, so no real moi server answers.
      MOI_CONTROL_PORT: '1'
    }
  })
  const [code, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text()
  ])
  return { code, stdout, stderr }
}

test.skipIf(asRoot)(
  'a system command is refused when moi’s data folder is closed',
  async () => {
    const result = await runCli(['update'])
    expect(result.code).toBe(1)
    expect(result.stdout).toContain('moi update is only available to the user that runs moi')
    expect(result.stderr).not.toContain('could not read')
  },
  SPAWN_TIMEOUT
)

test.skipIf(asRoot)(
  '`moi version` still works',
  async () => {
    const result = await runCli(['version'])
    expect(result.code).toBe(0)
    expect(result.stdout).toMatch(/\d+\.\d+\.\d+/)
  },
  SPAWN_TIMEOUT
)

test.skipIf(asRoot)(
  '`moi env` asks the server instead of reading moi’s files',
  async () => {
    const result = await runCli(['env'])
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('Is the main process running?')
    expect(result.stderr).not.toContain('EACCES')
  },
  SPAWN_TIMEOUT
)
