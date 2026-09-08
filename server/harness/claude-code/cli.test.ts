import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { chmod, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { claudeCliKey, parseClaudeVersion, probeClaudeCli } from './cli'

let tempDir: string

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'moi-claude-cli-'))
})

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true })
})

async function fakeClaude(script: string): Promise<string> {
  const path = join(tempDir, 'claude')
  await Bun.write(path, `#!/bin/sh\n${script}\n`)
  await chmod(path, 0o755)
  return path
}

describe('parseClaudeVersion', () => {
  test('keeps the first non-empty line', () => {
    expect(parseClaudeVersion('2.1.263 (Claude Code)\n')).toBe('2.1.263 (Claude Code)')
    expect(parseClaudeVersion('\n\n  2.1.263 (Claude Code)  \nnoise\n')).toBe(
      '2.1.263 (Claude Code)'
    )
  })

  test('returns null for empty output', () => {
    expect(parseClaudeVersion('')).toBeNull()
    expect(parseClaudeVersion('\n \n')).toBeNull()
  })
})

describe('claudeCliKey', () => {
  test('changes with the executable and with the version', () => {
    const a = claudeCliKey({ executable: '/a/claude', version: '2.1.238 (Claude Code)' })
    expect(claudeCliKey({ executable: '/a/claude', version: '2.1.238 (Claude Code)' })).toBe(a)
    expect(claudeCliKey({ executable: '/a/claude', version: '2.1.263 (Claude Code)' })).not.toBe(a)
    expect(claudeCliKey({ executable: '/b/claude', version: '2.1.238 (Claude Code)' })).not.toBe(a)
    expect(claudeCliKey({ executable: '/a/claude', version: null })).not.toBe(a)
  })
})

describe('probeClaudeCli', () => {
  test('reports the version the executable prints', async () => {
    const executable = await fakeClaude('echo "2.1.263 (Claude Code)"')
    expect(await probeClaudeCli(executable)).toEqual({
      executable,
      version: '2.1.263 (Claude Code)'
    })
  })

  test('reports no version when the executable fails', async () => {
    const executable = await fakeClaude('echo "2.1.263 (Claude Code)"; exit 2')
    expect(await probeClaudeCli(executable)).toEqual({ executable, version: null })
  })

  test('reports no version when the executable cannot be spawned', async () => {
    const executable = join(tempDir, 'missing')
    expect(await probeClaudeCli(executable)).toEqual({ executable, version: null })
  })
})
