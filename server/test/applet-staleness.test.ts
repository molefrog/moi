import { afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'path'

import { buildApplets, scanSources } from '../applets'
import { buildApplet, scanModuleImports } from '../bundler/build-applet'

// Entry-point and staleness rules for the applet build loop: `_`-prefixed
// files are shared modules (never entries), and a bundle goes stale when
// anything in its local import graph changes — not just the entry source.
// The dependency tests run real Bun.build compiles against a temp workspace.

const FIXTURES = join(import.meta.dir, '__fixtures__')

// Same first-Bun.build-under-`bun test` quirk as build-applet.test.ts — swallow
// one throwaway build so every real test starts from the working state.
beforeAll(async () => {
  await buildApplet(join(FIXTURES, 'hello.tsx')).catch(() => {})
})

let WS: string
beforeEach(() => {
  WS = mkdtempSync(join(import.meta.dir, 'moi-stale-'))
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

async function build() {
  const { results } = await buildApplets(WS, 'widget', false)
  return results
}

describe('underscore-prefixed shared modules', () => {
  test('scanSources skips _-prefixed files', async () => {
    seed('.moi/widgets/clock.tsx', 'export default function Clock() { return null }')
    seed('.moi/widgets/_utils.ts', 'export const x = 1')
    seed('.moi/widgets/_shared.tsx', 'export const y = 2')
    seed('.moi/widgets/clock.server.ts', 'export async function f() {}')
    expect(await scanSources(join(WS, '.moi', 'widgets'))).toEqual(['clock'])
  })

  test('a previously built _-named applet is pruned, not rebuilt', async () => {
    // Before the underscore convention, `_shared.tsx` would have compiled as
    // its own widget. Now it's a shared module: it is not an entry, and its
    // leftover build dir is swept as an orphan.
    seed('.moi/widgets/_shared.tsx', 'export default function S() { return null }')
    const orphan = join(WS, '.moi', '.build', 'widgets', '_shared')
    mkdirSync(orphan, { recursive: true })
    writeFileSync(join(orphan, 'index.js'), '//')

    const { names, results } = await buildApplets(WS, 'widget', false)
    expect(names).toEqual([])
    expect(results).toEqual([])
    expect(existsSync(orphan)).toBe(false)
  })
})

describe('scanModuleImports', () => {
  test('catches static, re-export, side-effect, and dynamic relative imports', () => {
    const src = [
      `import { a } from './_utils'`,
      `export * from '../lib/shared'`,
      `export { b } from './re-export'`,
      `import './side-effect'`,
      `const lazy = await import('./panels/heavy')`
    ].join('\n')
    expect(scanModuleImports(src)).toEqual([
      './_utils',
      '../lib/shared',
      './re-export',
      './side-effect',
      './panels/heavy'
    ])
  })

  test('skips bare specifiers, .server imports, and assets', () => {
    const src = [
      `import React from 'react'`,
      `import { getData } from './data.server'`,
      `import logo from './logo.png'`,
      `import { helper } from './helper'`
    ].join('\n')
    expect(scanModuleImports(src)).toEqual(['./helper'])
  })

  test('lexes real syntax — comments, strings, and type-only imports never count', () => {
    const src = [
      `// import { ghost } from './commented-out'`,
      `const s = "import { x } from './in-a-string'"`,
      `import type { T } from './types-only'`,
      `import { real } from './real'`
    ].join('\n')
    expect(scanModuleImports(src)).toEqual(['./real'])
  })

  test('a file that fails to lex contributes no imports', () => {
    expect(scanModuleImports(`import { from`)).toEqual([])
  })

  test('the ts loader handles angle-bracket casts tsx cannot', () => {
    const src = [`const v = <string>window.name`, `import { q } from './cast-file'`].join('\n')
    expect(scanModuleImports(src, 'ts')).toEqual(['./cast-file'])
  })
})

describe('dependency staleness', () => {
  const WIDGET = [
    `import { label } from './_utils'`,
    `export default function Clock() { return <div>{label}</div> }`
  ].join('\n')
  const UTILS = [`import { deep } from '../lib/deep'`, `export const label = 'clock ' + deep`].join(
    '\n'
  )
  const DEEP = `export const deep = 'deep-value'`

  function seedGraph() {
    seed('.moi/widgets/clock.tsx', WIDGET)
    seed('.moi/widgets/_utils.ts', UTILS)
    seed('.moi/lib/deep.ts', DEEP)
  }

  test('editing a shared sibling module marks the applet stale', async () => {
    seedGraph()

    expect((await build())[0]).toMatchObject({ name: 'clock', status: 'built' })
    // The shared module's code really lands in the bundle.
    const entry = join(WS, '.moi', '.build', 'widgets', 'clock', 'index.js')
    expect(await Bun.file(entry).text()).toContain('deep-value')
    expect((await build())[0]).toMatchObject({ status: 'skipped' })

    seed('.moi/widgets/_utils.ts', UTILS + '\n// edited')
    expect((await build())[0]).toMatchObject({ status: 'built' })
    expect((await build())[0]).toMatchObject({ status: 'skipped' })
  })

  test('editing a transitive dependency outside the source dir marks the applet stale', async () => {
    seedGraph()

    expect((await build())[0]).toMatchObject({ name: 'clock', status: 'built' })
    expect((await build())[0]).toMatchObject({ status: 'skipped' })

    // `deep.ts` is only reachable through `_utils.ts`, and lives in `.moi/lib/`
    // rather than the widgets dir — the walk must still find it.
    seed('.moi/lib/deep.ts', DEEP + '\n// edited')
    expect((await build())[0]).toMatchObject({ status: 'built' })
    expect((await build())[0]).toMatchObject({ status: 'skipped' })
  })

  test('a graph larger than the file cap always rebuilds (fails toward stale)', async () => {
    // 520+ chained modules exceed MAX_GRAPH_FILES: the walk aborts and reports
    // stale, so the applet rebuilds every bundle instead of risking a stale
    // skip. Degenerate by design — no sane applet wires this many local files.
    seed(
      '.moi/widgets/big.tsx',
      [
        `import { label } from './_head'`,
        `export default function Big() { return <div>{label}</div> }`
      ].join('\n')
    )
    seed('.moi/widgets/_head.ts', [`import '../lib/c0'`, `export const label = 'big'`].join('\n'))
    const LAST = 520
    for (let i = 0; i <= LAST; i++) {
      const next = i < LAST ? `import './c${i + 1}'\n` : ''
      seed(`.moi/lib/c${i}.ts`, `${next}export const v${i} = ${i}`)
    }

    expect((await build())[0]).toMatchObject({ name: 'big', status: 'built' })
    // Would be 'skipped' under the cap — the oversized graph forces a rebuild.
    expect((await build())[0]).toMatchObject({ status: 'built' })
  })
})
