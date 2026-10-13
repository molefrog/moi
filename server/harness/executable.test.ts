import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { chmod, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'

import {
  findHarnessExecutable,
  detectInstalledHarnesses,
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
  test("ignores moi's bundled OpenClaw command even when bun run adds it to PATH", async () => {
    const bundledBin = join(import.meta.dir, '..', '..', 'node_modules', '.bin')
    const searchPath = [bundledBin, tempDir].join(delimiter)
    expect(findHarnessExecutable('openclaw', searchPath)).toBeNull()
    expect((await detectInstalledHarnesses(searchPath)).openclaw).toBe(false)

    const installed = await addExecutable('openclaw')
    expect(findHarnessExecutable('openclaw', searchPath)).toBe(installed)
    expect((await detectInstalledHarnesses(searchPath)).openclaw).toBe(true)
  })

  test('detects installations without profiles, credentials, or gateways', async () => {
    expect(await detectInstalledHarnesses(tempDir)).toEqual({
      'claude-code': false,
      codex: false,
      openclaw: false,
      hermes: false
    })
    for (const command of ['claude', 'codex', 'openclaw', 'hermes']) await addExecutable(command)
    expect(await detectInstalledHarnesses(tempDir)).toEqual({
      'claude-code': true,
      codex: true,
      openclaw: true,
      hermes: true
    })
    await rm(join(tempDir, 'codex'))
    expect((await detectInstalledHarnesses(tempDir)).codex).toBe(false)
  })

  test('does not mistake a bundled OpenClaw package or a non-executable file for a CLI', async () => {
    // moi has the optional SDK installed; only a command on the search PATH
    // establishes that the user's OpenClaw harness is installed.
    await Bun.write(join(tempDir, 'openclaw'), 'not executable')
    expect((await detectInstalledHarnesses(tempDir)).openclaw).toBe(false)
    await chmod(join(tempDir, 'openclaw'), 0o755)
    expect((await detectInstalledHarnesses(tempDir)).openclaw).toBe(true)
  })

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
      status: 'unavailable',
      reason: 'Run in terminal to install Claude Code: curl -fsSL https://claude.ai/install.sh | sh'
    })
    expect(() => requireHarnessExecutable('codex', tempDir)).toThrow(
      'Run in terminal to install Codex: curl -fsSL https://chatgpt.com/codex/install.sh | sh'
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

  test('tolerates undefined segments', () => {
    expect(mergeSearchPaths(undefined, '/usr/bin', undefined)).toBe('/usr/bin')
  })
})
