import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { chmod, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  findHarnessExecutable,
  pathHarnessAvailability,
  requireHarnessExecutable
} from './executable'

let tempDir: string

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'moi-harness-path-'))
})

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true })
})

async function addExecutable(command: string): Promise<string> {
  const path = join(tempDir, command)
  await Bun.write(path, '#!/bin/sh\nexit 0\n')
  await chmod(path, 0o755)
  return path
}

describe('PATH harness executables', () => {
  test('resolves Claude and Codex only from the supplied PATH', async () => {
    const claude = await addExecutable('claude')
    const codex = await addExecutable('codex')

    expect(findHarnessExecutable('claude-code', tempDir)).toBe(claude)
    expect(findHarnessExecutable('codex', tempDir)).toBe(codex)
    expect(requireHarnessExecutable('claude-code', tempDir)).toBe(claude)
    expect(requireHarnessExecutable('codex', tempDir)).toBe(codex)
  })

  test('returns install instructions when an executable is missing', () => {
    expect(findHarnessExecutable('claude-code', tempDir)).toBeNull()
    expect(findHarnessExecutable('codex', tempDir)).toBeNull()
    expect(pathHarnessAvailability('claude-code', tempDir)).toEqual({
      available: false,
      reason: 'Run curl -fsSL https://claude.ai/install.sh | sh in your terminal to install Claude'
    })
    expect(() => requireHarnessExecutable('codex', tempDir)).toThrow(
      'Run curl -fsSL https://chatgpt.com/codex/install.sh | sh in your terminal to install Codex'
    )
  })
})
