import { afterAll, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'path'

import { serverCwd } from './server-cwd'

// Each case builds a throwaway "package root" so the dist/index.html probe is
// exercised against the real filesystem, not a mock.
const roots: string[] = []
function makeRoot(withDist: boolean): string {
  const root = mkdtempSync(join(tmpdir(), 'moi-cwd-'))
  roots.push(root)
  if (withDist) {
    mkdirSync(join(root, 'dist'), { recursive: true })
    writeFileSync(join(root, 'dist', 'index.html'), '<!doctype html>')
  }
  return root
}

afterAll(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true })
})

test('dev always runs in the package root (bunfig + relative plugins load there)', () => {
  const root = makeRoot(true) // dist present, but --dev forces the bundler
  expect(serverCwd(root, true)).toBe(root)
})

test('prebuilt install runs from a neutral dir, NOT the package root', () => {
  // This is the fix: a prebuilt/global install must not sit inside the dir that
  // `bun i -g` replaces, or its cwd dangles on upgrade.
  const root = makeRoot(true)
  const cwd = serverCwd(root, false)
  expect(cwd).not.toBe(root)
  expect(cwd).toBe(homedir())
})

test('source checkout without a built dist falls back to the package root', () => {
  // `moi start` (no --dev) on an unbuilt source tree still needs the dev
  // bundler → still needs the bunfig → must stay in the package root.
  const root = makeRoot(false)
  expect(serverCwd(root, false)).toBe(root)
})
