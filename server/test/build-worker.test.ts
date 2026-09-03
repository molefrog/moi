import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'path'

import { buildApplets } from '../applets'

// The applet build loop compiles in a fresh child process per batch because
// Bun's resolver cache is process-wide and permanent: a failed bare-specifier
// lookup, a `node_modules` listing, and a package's `package.json` are all
// memoized for the life of the process. These tests drive the agent's real
// loop — build, see the missing package, install it, build again — through
// `buildApplets` inside ONE test process, which is exactly the situation the
// long-running server is in.

let WS: string
beforeEach(() => {
  WS = mkdtempSync(join(import.meta.dir, 'moi-worker-'))
})
afterEach(() => {
  rmSync(WS, { recursive: true, force: true })
})

function seed(rel: string, contents: string): string {
  const path = join(WS, rel)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, contents)
  return path
}

// What `bun add <pkg>` leaves behind in the workspace's `.moi/node_modules`.
function installPackage(name: string, files: Record<string, string>) {
  for (const [file, contents] of Object.entries(files)) {
    seed(join('.moi', 'node_modules', name, file), contents)
  }
}

function builtEntry(name: string): string {
  return readFileSync(join(WS, '.moi', '.build', 'widgets', name, 'index.js'), 'utf8')
}

describe('buildApplets compiles out of process', () => {
  test('a package installed after a failed build resolves on the next build', async () => {
    seed(
      '.moi/widgets/greeting.tsx',
      `import { hello } from 'fake-greeter'\nexport default function G() { return <div>{hello}</div> }`
    )

    const first = await buildApplets(WS, 'widget', true)
    expect(first.results).toEqual([
      { name: 'greeting', status: 'failed', error: expect.stringContaining('fake-greeter') }
    ])
    expect(existsSync(join(WS, '.moi', '.build', 'widgets', 'greeting'))).toBe(false)

    installPackage('fake-greeter', {
      'package.json': JSON.stringify({ name: 'fake-greeter', main: 'index.js' }),
      'index.js': `export const hello = 'hello from fake-greeter'`
    })

    const second = await buildApplets(WS, 'widget', true)
    expect(second.results).toEqual([
      { name: 'greeting', status: 'built', serverModules: [], config: null }
    ])
    expect(builtEntry('greeting')).toContain('hello from fake-greeter')
  })

  test('a subpath export added to an installed package is picked up', async () => {
    installPackage('fake-ui', {
      'package.json': JSON.stringify({ name: 'fake-ui', exports: { '.': './index.js' } }),
      'index.js': `export const root = 1`,
      'button.js': `export const Button = 'fake-ui button'`
    })
    seed(
      '.moi/widgets/btn.tsx',
      `import { Button } from 'fake-ui/button'\nexport default function B() { return <div>{Button}</div> }`
    )

    const first = await buildApplets(WS, 'widget', true)
    expect(first.results[0]).toMatchObject({ status: 'failed' })
    expect(first.results[0].error).toContain('fake-ui/button')

    // The upgrade that ships the subpath (what `bun add fake-ui@next` does).
    installPackage('fake-ui', {
      'package.json': JSON.stringify({
        name: 'fake-ui',
        exports: { '.': './index.js', './button': './button.js' }
      })
    })

    const second = await buildApplets(WS, 'widget', true)
    expect(second.results[0]).toMatchObject({ status: 'built' })
    expect(builtEntry('btn')).toContain('fake-ui button')
  })

  test('one failing applet does not fail the rest of the batch', async () => {
    seed('.moi/widgets/ok.tsx', `export default function Ok() { return <div>ok</div> }`)
    seed('.moi/widgets/broken.tsx', `import { x } from 'not-installed'\nexport default () => x`)

    const { results } = await buildApplets(WS, 'widget', true)
    const byName = Object.fromEntries(results.map(r => [r.name, r]))
    expect(byName.ok).toMatchObject({ status: 'built' })
    expect(byName.broken).toMatchObject({
      status: 'failed',
      error: expect.stringContaining('not-installed')
    })
    expect(existsSync(join(WS, '.moi', '.build', 'widgets', 'ok', 'index.js'))).toBe(true)
    expect(existsSync(join(WS, '.moi', '.build', 'widgets', 'broken'))).toBe(false)
  })

  test('server modules and config still come back through the child', async () => {
    seed('.moi/widgets/clock.server.ts', `export async function now() { return Date.now() }`)
    seed(
      '.moi/widgets/clock.tsx',
      `import { now } from './clock.server'\nexport const config = { rowSpan: 2, colSpan: 3 }\nexport default function C() { return <button onClick={() => now()}>t</button> }`
    )

    const { results } = await buildApplets(WS, 'widget', true)
    expect(results).toEqual([
      {
        name: 'clock',
        status: 'built',
        serverModules: ['widgets/clock'],
        config: { rowSpan: 2, colSpan: 3 }
      }
    ])
  })
})
