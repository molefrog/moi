import { afterEach, beforeEach, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'path'

import { buildApplets, buildAppletsEphemeral } from '../applets'

// The reason `buildAppletsEphemeral` exists: Bun caches a FAILED bare-specifier
// resolution for the life of the process, and installing the package does not
// invalidate the entry. The long-running server compiles through a one-shot
// worker so the agent's build → `bun add` → rebuild loop converges instead of
// failing until a server restart. These tests drive the real worker subprocess.

let WS: string
beforeEach(() => {
  // Inside the repo, not tmpdir: the applet build resolves `tailwindcss` from
  // node_modules up the tree.
  WS = mkdtempSync(join(import.meta.dir, 'moi-ephbundle-'))
})
afterEach(() => {
  rmSync(WS, { recursive: true, force: true })
})

function seed(rel: string, contents: string) {
  const path = join(WS, rel)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, contents)
}

// What `bun add fake-eph-pkg` leaves on disk, minus the network.
function installFakePkg() {
  const pkg = join(WS, '.moi', 'node_modules', 'fake-eph-pkg')
  mkdirSync(pkg, { recursive: true })
  writeFileSync(
    join(pkg, 'package.json'),
    JSON.stringify({ name: 'fake-eph-pkg', version: '1.0.0', main: 'index.js' })
  )
  writeFileSync(join(pkg, 'index.js'), 'export const label = "hi"')
}

test('a package installed after a failed build resolves on the next bundle', async () => {
  seed(
    '.moi/widgets/hello.tsx',
    [
      `import { label } from 'fake-eph-pkg'`,
      `export default function Hello() { return <div>{label}</div> }`
    ].join('\n')
  )

  // Poison THIS process the way the pre-worker server poisoned itself: an
  // in-process build that fails on the not-yet-installed package.
  const poisoned = await buildApplets(WS, 'widget', false)
  expect(poisoned.results[0]?.status).toBe('failed')
  expect(poisoned.results[0]?.error).toContain('Could not resolve')

  installFakePkg()

  // The worker compiles in a fresh process, so it sees the install even
  // though this process's resolver now has a permanent negative entry for
  // the specifier.
  const fixed = await buildAppletsEphemeral(WS, 'widget', false)
  expect(fixed.results[0]).toMatchObject({ name: 'hello', status: 'built' })
  expect(existsSync(join(WS, '.moi', '.build', 'widgets', 'hello', 'index.js'))).toBe(true)
}, 60_000)

test('an unchanged applet is answered as skipped without recompiling', async () => {
  installFakePkg()
  seed(
    '.moi/widgets/hello.tsx',
    [
      `import { label } from 'fake-eph-pkg'`,
      `export default function Hello() { return <div>{label}</div> }`
    ].join('\n')
  )

  const first = await buildAppletsEphemeral(WS, 'widget', false)
  expect(first.results[0]).toMatchObject({ name: 'hello', status: 'built' })

  // Nothing pending now, so the batch short-circuits in-process (resolver-free
  // scan + staleness only — no worker spawn) and reports the skip.
  const second = await buildAppletsEphemeral(WS, 'widget', false)
  expect(second.results[0]).toMatchObject({ name: 'hello', status: 'skipped' })
}, 60_000)

test('a genuine compile error surfaces as a failed row, not a crashed batch', async () => {
  seed(
    '.moi/widgets/broken.tsx',
    [`import { nope } from './missing'`, `export default function Broken() { return nope }`].join(
      '\n'
    )
  )

  const res = await buildAppletsEphemeral(WS, 'widget', false)
  expect(res.results[0]?.name).toBe('broken')
  expect(res.results[0]?.status).toBe('failed')
  expect(res.results[0]?.error).toContain('Could not resolve')
}, 60_000)
