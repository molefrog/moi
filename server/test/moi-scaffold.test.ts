import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'path'

import { scaffoldMoiDir } from '../moi-scaffold'

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

describe('scaffoldMoiDir install', () => {
  test('returns the exit code when the install finishes within the wait', async () => {
    const moiDir = join(WS, '.moi')

    const result = await scaffoldMoiDir(WS, async cwd => {
      expect(cwd).toBe(moiDir)
      return 137
    })

    expect(result).toBe(137)
    expect(existsSync(join(moiDir, 'package.json'))).toBe(true)
    expect(existsSync(join(moiDir, 'components.json'))).toBe(true)
    expect(existsSync(join(moiDir, 'tsconfig.json'))).toBe(true)
    expect(existsSync(join(moiDir, 'lib', 'utils.ts'))).toBe(true)
    expect(existsSync(join(moiDir, 'widgets'))).toBe(true)

    const packageJson = (await Bun.file(join(moiDir, 'package.json')).json()) as {
      dependencies: Record<string, string>
    }
    const componentsJson = (await Bun.file(join(moiDir, 'components.json')).json()) as {
      style: string
      iconLibrary: string
      tailwind: { css: string }
    }
    expect(packageJson.dependencies.clsx).toBeDefined()
    expect(packageJson.dependencies['tailwind-merge']).toBeDefined()
    expect(componentsJson).toMatchObject({
      style: 'base-nova',
      iconLibrary: 'tabler',
      tailwind: { css: '' }
    })
    expect(await Bun.file(join(moiDir, 'lib', 'utils.ts')).text()).toContain('export const cn = cx')
    expect(await Bun.file(join(moiDir, 'applet-env.d.ts')).text()).toContain('icon?: string')
  })

  test('returns "installing" when the install outlives the wait', async () => {
    let finish!: (code: number) => void
    const exited = new Promise<number>(r => (finish = r))

    const result = await scaffoldMoiDir(WS, () => exited, 10)

    expect(result).toBe('installing')
    finish(0)
    expect(await exited).toBe(0)
  })

  test('leaves an existing manifest untouched and skips the install', async () => {
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
    expect(existsSync(join(moiDir, 'components.json'))).toBe(false)
  })
})
