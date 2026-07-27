import { afterEach, describe, expect, test } from 'bun:test'
import { chmod, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CLI = join(import.meta.dir, '..', 'cli.ts')
const PROJECT_ROOT = join(import.meta.dir, '..', '..')

let tempRoot = ''

afterEach(async () => {
  if (!tempRoot) return
  await rm(tempRoot, { recursive: true, force: true })
  tempRoot = ''
})

describe('moi skill update commands', () => {
  for (const command of ['update', 'install'] as const) {
    test(`${command} exits non-zero without a full-success message when shadcn fails`, async () => {
      tempRoot = await mkdtemp(join(tmpdir(), `moi-skill-${command}-`))
      const workspace = join(tempRoot, 'workspace')
      const binDir = join(tempRoot, 'bin')
      const bunx = join(binDir, 'bunx')
      await mkdir(binDir, { recursive: true })
      await Bun.write(bunx, '#!/bin/sh\nexit 23\n')
      await chmod(bunx, 0o755)

      const proc = Bun.spawn([process.execPath, CLI, 'skill', command, '--dir', workspace], {
        cwd: PROJECT_ROOT,
        env: { ...globalThis.process.env, PATH: binDir, NO_COLOR: '1' },
        stdout: 'pipe',
        stderr: 'pipe'
      })
      const [exitCode, stdout, stderr] = await Promise.all([
        proc.exited,
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text()
      ])
      const output = stdout + stderr

      expect(exitCode).not.toBe(0)
      expect(output).toContain('moi skill updated')
      expect(output).toContain('Official shadcn skill refresh failed')
      expect(output).not.toContain('✓ Skills updated')
    })
  }
})
