import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { resolvePackageTypeRoot, typecheckApplets } from '../applet-typecheck'

let workspaceRoot = ''

beforeEach(async () => {
  workspaceRoot = await mkdtemp(join(tmpdir(), 'moi-applet-typecheck-'))
  await mkdir(join(workspaceRoot, '.moi', 'views'), { recursive: true })
  await mkdir(join(workspaceRoot, '.moi', 'widgets'), { recursive: true })
})

afterEach(async () => {
  await rm(workspaceRoot, { recursive: true, force: true })
})

describe('applet typecheck', () => {
  test('checks applet and Bun ambient types without a workspace tsconfig', async () => {
    await Bun.write(
      join(workspaceRoot, '.moi', 'views', 'notes.tsx'),
      `import type { ViewConfig } from 'moi'
export const config = { title: 'Notes' } satisfies ViewConfig
export default function Notes() { return null }
`
    )
    await Bun.write(
      join(workspaceRoot, '.moi', 'views', 'notes.server.ts'),
      `export async function readNotes() { return Bun.file('notes.md').text() }
`
    )

    const result = await typecheckApplets(workspaceRoot, 'views')

    expect(result.files).toHaveLength(2)
    expect(result.diagnostics).toEqual([])
  })

  test('uses the @types/bun shipped with moi, not one installed in the workspace', async () => {
    const shadow = join(workspaceRoot, '.moi', 'node_modules', '@types', 'bun')
    await mkdir(shadow, { recursive: true })
    await Bun.write(
      join(shadow, 'package.json'),
      '{ "name": "@types/bun", "types": "index.d.ts" }\n'
    )
    await Bun.write(join(shadow, 'index.d.ts'), 'export {}\n')
    await Bun.write(
      join(workspaceRoot, '.moi', 'views', 'notes.server.ts'),
      `export async function readNotes() { return Bun.file('notes.md').text() }
`
    )
    await Bun.write(
      join(workspaceRoot, '.moi', 'views', 'notes.tsx'),
      `export default function Notes() { return null }
`
    )

    expect((await typecheckApplets(workspaceRoot, 'views')).diagnostics).toEqual([])
  })

  test('reports source errors and respects the applet-kind scope', async () => {
    await Bun.write(
      join(workspaceRoot, '.moi', 'widgets', 'broken.tsx'),
      `const count: number = 'three'
export default function Broken() { return count }
`
    )

    expect((await typecheckApplets(workspaceRoot, 'views')).diagnostics).toEqual([])
    expect((await typecheckApplets(workspaceRoot, 'widgets')).diagnostics).not.toEqual([])
  })

  test('checks one applet entry, its server sibling, and imported files', async () => {
    await Bun.write(
      join(workspaceRoot, '.moi', 'views', 'notes.tsx'),
      `import { label } from './_shared'
export default function Notes() { return label }
`
    )
    await Bun.write(
      join(workspaceRoot, '.moi', 'views', '_shared.ts'),
      `export const label: number = 'Notes'
`
    )
    await Bun.write(
      join(workspaceRoot, '.moi', 'views', 'notes.server.ts'),
      `export async function readNotes(): Promise<number> { return 'Notes' }
`
    )
    await Bun.write(
      join(workspaceRoot, '.moi', 'views', 'unrelated.tsx'),
      `const count: number = 'three'
export default function Unrelated() { return count }
`
    )

    const result = await typecheckApplets(workspaceRoot, 'views/notes')

    expect(result.files.map(file => file.slice(file.lastIndexOf('/') + 1))).toEqual([
      'notes.tsx',
      'notes.server.ts'
    ])
    expect(result.diagnostics).toHaveLength(2)
    expect(
      result.diagnostics.every(diagnostic =>
        ['_shared.ts', 'notes.server.ts'].some(file => diagnostic.file?.fileName.endsWith(file))
      )
    ).toBe(true)
  })
})

describe('resolvePackageTypeRoot', () => {
  test('finds @types/bun hoisted beside the package, as `bun install -g` lays it out', async () => {
    const typesDir = join(workspaceRoot, 'node_modules', '@types', 'bun')
    const serverDir = join(workspaceRoot, 'node_modules', 'moi-computer', 'server')
    await mkdir(typesDir, { recursive: true })
    await mkdir(serverDir, { recursive: true })
    await Bun.write(join(typesDir, 'package.json'), '{ "name": "@types/bun" }\n')

    const [actual, expected] = await Promise.all([
      realpath(resolvePackageTypeRoot(serverDir)),
      realpath(join(workspaceRoot, 'node_modules', '@types'))
    ])
    expect(actual).toBe(expected)
  })

  test('resolves the shipped types from this checkout', () => {
    expect(resolvePackageTypeRoot()).toEndWith(join('node_modules', '@types'))
  })
})
