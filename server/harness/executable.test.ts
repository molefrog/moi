import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { chmod, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'

import {
  findHarnessExecutable,
  firstExecutable,
  pathHarnessAvailability,
  requireHarnessExecutable
} from './executable'
import { mergeSearchPaths } from './shell-path'

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

  test('returns install instructions when an executable is missing', async () => {
    expect(findHarnessExecutable('claude-code', tempDir)).toBeNull()
    expect(findHarnessExecutable('codex', tempDir)).toBeNull()
    expect(await pathHarnessAvailability('claude-code', tempDir)).toEqual({
      available: false,
      reason: 'Run curl -fsSL https://claude.ai/install.sh | sh in your terminal to install Claude'
    })
    expect(() => requireHarnessExecutable('codex', tempDir)).toThrow(
      'Run curl -fsSL https://chatgpt.com/codex/install.sh | sh in your terminal to install Codex'
    )
  })
})

describe('firstExecutable', () => {
  test('returns the first path that is an executable file', async () => {
    const codex = await addExecutable('codex')
    expect(firstExecutable([join(tempDir, 'missing'), codex])).toBe(codex)
  })

  test('skips files without the executable bit and directories', async () => {
    const plain = join(tempDir, 'codex-plain')
    await Bun.write(plain, 'not a binary')
    expect(firstExecutable([plain, tempDir])).toBeNull()
  })
})

describe('mergeSearchPaths', () => {
  test('keeps order, drops duplicates and empty segments', () => {
    const merged = mergeSearchPaths(
      ['/shell/bin', '/usr/bin'].join(delimiter),
      ['/usr/bin', '', '/proc/bin'].join(delimiter)
    )
    expect(merged).toBe(['/shell/bin', '/usr/bin', '/proc/bin'].join(delimiter))
  })

  test('tolerates null and undefined segments', () => {
    expect(mergeSearchPaths(null, undefined, '/usr/bin')).toBe('/usr/bin')
  })
})
