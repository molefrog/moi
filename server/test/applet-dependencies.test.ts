import { afterEach, beforeEach, expect, test } from 'bun:test'
import { mkdtemp, rm, symlink, utimes } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { analyzeAppletDependencies, analyzeDependencies } from '../applets/dependencies'
import { deleteViewSourceFiles } from '../applets/view-source'

let workspace: string

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'moi-dependencies-'))
})

afterEach(() => rm(workspace, { recursive: true, force: true }))

async function seed(path: string, source = 'export const value = 1'): Promise<string> {
  const absolute = join(workspace, '.moi', path)
  await Bun.write(absolute, source)
  return absolute
}

async function exists(path: string): Promise<boolean> {
  return Bun.file(join(workspace, '.moi', path)).exists()
}

test('analyzes one module or all applets, including cycles, assets and companion server modules', async () => {
  const entry = await seed('views/cards.tsx', "export * from '../lib/a'")
  const a = await seed('lib/a.ts', "export * from './b'; import './rows.json'")
  const b = await seed('lib/b.ts', "export * from './a'")
  const rows = await seed('lib/rows.json', '[]')
  const server = await seed('views/cards.server.ts')
  const widget = await seed('widgets/clock.tsx', "export * from '../lib/a'")
  const orphan = await seed('views/_orphan.ts')

  const single = await analyzeDependencies([entry])
  expect(single.complete).toBe(true)
  expect(new Set(single.modules.keys())).toEqual(new Set([entry, a, b, rows]))
  expect(single.modules.get(a)?.imports).toEqual([b, rows])

  const all = await analyzeAppletDependencies(workspace)
  expect(all.complete).toBe(true)
  expect(all.entrypoints).toEqual(new Set([entry, server, widget]))
  expect(all.modules.has(orphan)).toBe(false)
  expect(all.modules.size).toBe(6)
})

test('a changed entry stops the rebuild check before reading its dependencies', async () => {
  const entry = await seed('views/cards.tsx', "export * from '../lib/a'")
  await seed('lib/a.ts')
  await utimes(entry, 10, 10)
  const graph = await analyzeDependencies([entry], 9_000)
  expect(graph.complete).toBe(false)
  expect(graph.modules.size).toBe(1)
})

test('deletes only the view and its unused transitive code dependencies', async () => {
  await seed('views/cards.tsx', "export * from './_utils'")
  await seed('views/_utils.ts', "export * from '../lib/fetch.server'; import '../data/rows.json'")
  await seed('lib/fetch.server.ts', "export * from './db'")
  await seed('lib/db.ts')
  await seed('views/cards.server.ts', "export * from './_server-utils'")
  await seed('views/_server-utils.ts')
  await seed('views/_unrelated.ts')
  await seed('data/rows.json', '[]')

  await deleteViewSourceFiles(workspace, 'cards')

  for (const path of [
    'views/cards.tsx',
    'views/_utils.ts',
    'lib/fetch.server.ts',
    'lib/db.ts',
    'views/cards.server.ts',
    'views/_server-utils.ts'
  ]) {
    expect(await exists(path)).toBe(false)
  }
  expect(await exists('views/_unrelated.ts')).toBe(true)
  expect(await exists('data/rows.json')).toBe(true)
})

for (const kind of ['views', 'widgets']) {
  test(`preserves server functions and their helpers shared with other ${kind}`, async () => {
    await seed('views/cards.tsx', "export * from './_private'")
    await seed('views/_private.ts', "export * from './cards.server'")
    await seed('views/cards.server.ts', "export * from '../lib/utils'")
    await seed('lib/utils.ts')
    await seed(`${kind}/other.tsx`, "export * from '../lib/bridge'")
    await seed('lib/bridge.ts', "export * from '../views/cards.server'")

    await deleteViewSourceFiles(workspace, 'cards')

    expect(await exists('views/cards.tsx')).toBe(false)
    expect(await exists('views/_private.ts')).toBe(false)
    expect(await exists('views/cards.server.ts')).toBe(true)
    expect(await exists('lib/utils.ts')).toBe(true)
  })
}

test('preserves helpers used only by a remaining applet’s companion server module', async () => {
  await seed('views/cards.tsx', "export * from './_utils'")
  await seed('views/_utils.ts')
  await seed('views/other.tsx')
  await seed('views/other.server.ts', "export * from './_utils'")

  await deleteViewSourceFiles(workspace, 'cards')

  expect(await exists('views/_utils.ts')).toBe(true)
})

for (const source of ["export * from './missing'", 'import { from']) {
  test(`leaves helpers behind when a remaining applet cannot be analyzed: ${source}`, async () => {
    await seed('views/cards.tsx', "export * from './_utils'")
    await seed('views/cards.server.ts')
    await seed('views/_utils.ts')
    await seed('widgets/unfinished.tsx', source)

    expect((await analyzeAppletDependencies(workspace)).complete).toBe(false)
    await deleteViewSourceFiles(workspace, 'cards')

    expect(await exists('views/cards.tsx')).toBe(false)
    expect(await exists('views/cards.server.ts')).toBe(true)
    expect(await exists('views/_utils.ts')).toBe(true)
  })
}

test('caps the scan and leaves helpers behind for oversized graphs', async () => {
  await seed('views/cards.tsx', "export * from '../lib/helper0'")
  await Promise.all(
    Array.from({ length: 260 }, (_, i) =>
      seed(
        `lib/helper${i}.ts`,
        i < 259 ? `export * from './helper${i + 1}'` : 'export const value = 1'
      )
    )
  )

  const graph = await analyzeAppletDependencies(workspace)
  expect(graph.complete).toBe(false)
  expect(graph.modules.size).toBe(256)
  await deleteViewSourceFiles(workspace, 'cards')

  expect(await exists('views/cards.tsx')).toBe(false)
  expect(await exists('lib/helper0.ts')).toBe(true)
  expect(await exists('lib/helper259.ts')).toBe(true)
})

test('keeps installed UI components and code they import', async () => {
  await seed('views/cards.tsx', "export * from '../ui/card'")
  await seed('ui/card.tsx', "export * from '../lib/style'")
  await seed('lib/style.ts')

  await deleteViewSourceFiles(workspace, 'cards')

  expect(await exists('ui/card.tsx')).toBe(true)
  expect(await exists('lib/style.ts')).toBe(true)
})

test('leaves helpers alone when a symlink obscures their ownership', async () => {
  await seed('views/cards.tsx', "export * from './_utils'")
  const helper = await seed('views/_utils.ts')
  await symlink(helper, join(workspace, '.moi', 'views', '_alias.ts'))
  await seed('views/other.tsx', "export * from './_alias'")

  await deleteViewSourceFiles(workspace, 'cards')

  expect(await exists('views/cards.tsx')).toBe(false)
  expect(await exists('views/_utils.ts')).toBe(true)
})
