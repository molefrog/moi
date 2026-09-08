import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { typecheckApplets } from '../applet-typecheck'

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
