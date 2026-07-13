import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'path'

import { MOI_PACKAGE_JSON, scaffoldMoiDir } from '../moi-scaffold'

// The scaffold backstop: `scaffoldMoiDir` must refuse to create a `.moi/` inside
// another `.moi/` (the nested-workspace bug). The guard runs before any fs work,
// so these tests never touch the network (`bun install`).

let WS: string
beforeEach(() => {
  WS = mkdtempSync(join(import.meta.dir, 'moi-scaffold-test-'))
})
afterEach(() => {
  rmSync(WS, { recursive: true, force: true })
})

describe('scaffoldMoiDir guard', () => {
  test('refuses to scaffold inside a .moi directory (any nesting depth)', async () => {
    // The guard keys on the exact `.moi` path segment and runs before any fs
    // work, so nothing is created. (The "merely prefixed" case — `.moimoi` is a
    // normal name — is covered by liftToWorkspaceRoot's segment-exact tests.)
    await expect(scaffoldMoiDir(join(WS, '.moi'))).rejects.toThrow(/inside a \.moi/)
    await expect(scaffoldMoiDir(join(WS, '.moi', 'widgets'))).rejects.toThrow(/inside a \.moi/)
    await expect(scaffoldMoiDir(join(WS, '.moi', '.moi'))).rejects.toThrow(/inside a \.moi/)
    expect(existsSync(join(WS, '.moi'))).toBe(false)
  })
})

describe('scaffoldMoiDir interrupted installs', () => {
  test('retries a generated manifest left incomplete before markers existed', async () => {
    const moiDir = join(WS, '.moi')
    mkdirSync(moiDir, { recursive: true })
    writeFileSync(join(moiDir, 'package.json'), JSON.stringify(MOI_PACKAGE_JSON, null, 2))
    let installs = 0

    const result = await scaffoldMoiDir(WS, async cwd => {
      expect(cwd).toBe(moiDir)
      installs++
      return 0
    })

    expect(result).toBe(0)
    expect(installs).toBe(1)
    expect(existsSync(join(moiDir, '.install-pending'))).toBe(false)
  })

  test('keeps the pending marker after failure and retries it later', async () => {
    const moiDir = join(WS, '.moi')
    const first = await scaffoldMoiDir(WS, async () => 137)

    expect(first).toBe(137)
    expect(existsSync(join(moiDir, '.install-pending'))).toBe(true)

    const second = await scaffoldMoiDir(WS, async () => 0)
    expect(second).toBe(0)
    expect(existsSync(join(moiDir, '.install-pending'))).toBe(false)
  })

  test('leaves an existing user manifest untouched', async () => {
    const moiDir = join(WS, '.moi')
    mkdirSync(moiDir, { recursive: true })
    writeFileSync(join(moiDir, 'package.json'), JSON.stringify({ private: true }))
    let installs = 0

    const result = await scaffoldMoiDir(WS, async () => {
      installs++
      return 0
    })

    expect(result).toBe('exists')
    expect(installs).toBe(0)
  })
})
