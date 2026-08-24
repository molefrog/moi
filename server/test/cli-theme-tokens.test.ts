import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'path'

import { DEFAULT_WORKSPACE_THEME } from '@/lib/themes'
import { createDefaultWorkspaceLayout } from '@/lib/workspace-layout'

const CLI = join(import.meta.dir, '..', 'cli.ts')
const SPAWN_TIMEOUT = 30_000

let dataDir: string
let workspaceDir: string
let outsideDir: string

type CliResult = { code: number; stdout: string; stderr: string }

async function tempDir(prefix: string): Promise<string> {
  return realpath(await mkdtemp(join(tmpdir(), prefix)))
}

async function runCli(args: string[], cwd = workspaceDir): Promise<CliResult> {
  const proc = Bun.spawn(['bun', CLI, 'theme', ...args], {
    cwd,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      ...process.env,
      MOI_DATA_DIR: dataDir,
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

beforeEach(async () => {
  dataDir = await tempDir('moi-theme-token-data-')
  workspaceDir = await tempDir('moi-theme-token-workspace-')
  outsideDir = await tempDir('moi-theme-token-outside-')
  await mkdir(join(workspaceDir, '.moi', 'widgets'), { recursive: true })
  await Bun.write(
    join(dataDir, 'workspaces.json'),
    JSON.stringify([
      { id: 'theme-token-test', path: workspaceDir, addedAt: new Date().toISOString() }
    ])
  )
  await Bun.write(
    join(workspaceDir, '.moi', '.workspace.json'),
    JSON.stringify({ ...createDefaultWorkspaceLayout(), theme: DEFAULT_WORKSPACE_THEME })
  )
})

afterEach(async () => {
  for (const path of [dataDir, workspaceDir, outsideDir]) {
    await rm(path, { recursive: true, force: true })
  }
})

describe('moi theme --tokens', () => {
  test(
    'prints a scoped human-readable table from the workspace root',
    async () => {
      const result = await runCli(['--tokens', '--scope=view'])
      expect(result.code).toBe(0)
      expect(result.stderr).toBe('')
      expect(result.stdout).toContain('view scope, default color preset')
      expect(result.stdout).toContain('--background')
      expect(result.stdout).toContain('#ffffff')
      expect(result.stdout).toContain('base')
    },
    SPAWN_TIMEOUT
  )

  test(
    'prints stable widget JSON from a workspace subdirectory',
    async () => {
      const result = await runCli(
        ['--tokens', '--scope=widget', '--json'],
        join(workspaceDir, '.moi', 'widgets')
      )
      expect(result.code).toBe(0)
      expect(result.stderr).toBe('')
      const output = JSON.parse(result.stdout)
      expect(output.scope).toBe('widget')
      expect(output.theme).toEqual(DEFAULT_WORKSPACE_THEME)
      expect(output.values).toEqual({
        '--sans': 'system-ui',
        '--mono': 'Geist Mono',
        '--radius': '0.625rem'
      })
      expect(Object.keys(output.colors)).toHaveLength(24)
      expect(output.colors['--background']).toEqual({
        light: '#171717',
        dark: '#171717',
        derived: true
      })
      expect(output.colors['--chart-1'].derived).toBe(false)
    },
    SPAWN_TIMEOUT
  )

  test(
    'requires a valid scope',
    async () => {
      const missing = await runCli(['--tokens'])
      expect(missing.code).toBe(1)
      expect(missing.stderr).toContain('--tokens requires --scope=view or --scope=widget')

      const invalid = await runCli(['--tokens', '--scope=card'])
      expect(invalid.code).toBe(1)
      expect(invalid.stderr).toContain('--tokens requires --scope=view or --scope=widget')
    },
    SPAWN_TIMEOUT
  )

  test(
    'rejects token-only flags without --tokens',
    async () => {
      const scope = await runCli(['--scope=view'])
      expect(scope.code).toBe(1)
      expect(scope.stderr).toContain('--scope can only be used with --tokens')

      const json = await runCli(['--json'])
      expect(json.code).toBe(1)
      expect(json.stderr).toContain('--json can only be used with --tokens')
    },
    SPAWN_TIMEOUT
  )

  test(
    'rejects theme setters during token inspection',
    async () => {
      const result = await runCli(['--tokens', '--scope=view', '--color=sky'])
      expect(result.code).toBe(1)
      expect(result.stderr).toContain('--tokens cannot be combined with theme-setting flags')
    },
    SPAWN_TIMEOUT
  )

  test(
    'errors outside a registered workspace',
    async () => {
      const result = await runCli(['--tokens', '--scope=view'], outsideDir)
      expect(result.code).toBe(1)
      expect(result.stderr).toContain('not inside a registered moi workspace')
    },
    SPAWN_TIMEOUT
  )
})
