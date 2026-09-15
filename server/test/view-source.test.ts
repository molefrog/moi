import { afterAll, describe, expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { extractViewConfig, extractWidgetConfig, setViewSourceTitle } from '../applets/config'

const directory = await mkdtemp(join(tmpdir(), 'moi-view-source-'))
const sourcePath = join(directory, 'view.tsx')

afterAll(() => rm(directory, { recursive: true, force: true }))

describe('setViewSourceTitle', () => {
  const escaped = 'Quotes “work” with "code" and \\ paths'
  const cases: [string, string, string, object][] = [
    [
      'replaces the title while preserving config',
      "export const config = { title: 'Old', icon: 'chart', requiredEnv: ['API_KEY'] }\n",
      'New title',
      { title: 'New title', icon: 'chart', requiredEnv: ['API_KEY'] }
    ],
    [
      'adds a title to config',
      "export const config = {\n  icon: 'chart',\n  requiredEnv: ['API_KEY']\n}\n",
      'New title',
      { title: 'New title', icon: 'chart', requiredEnv: ['API_KEY'] }
    ],
    [
      'adds missing config',
      "import { useState } from 'react'\n\nexport default function View() { return useState() }\n",
      'New title',
      { title: 'New title' }
    ],
    ['escapes title text', 'export default function View() {}\n', escaped, { title: escaped }]
  ]

  for (const [name, source, title, expected] of cases) {
    test(name, async () => {
      await writeFile(sourcePath, setViewSourceTitle(source, title))
      expect(await extractViewConfig(sourcePath)).toEqual(expected)
    })
  }

  test('rejects a computed config', () => {
    expect(() =>
      setViewSourceTitle(
        "const makeConfig = () => ({ title: 'Old' })\nexport const config = makeConfig()\n",
        'New title'
      )
    ).toThrow('View config must be an exported object literal')
  })

  const runtimeCases: [string, string][] = [
    ['shorthand', "const title = 'Old'; export const config = { title }"],
    ['quoted key', "export const config = { 'title': 'Old' }"],
    ['computed string key', "export const config = { ['title']: 'Old' }"],
    ['unknown computed key', "const title = 'icon'; export const config = { [title]: 'chart' }"],
    ['empty config', 'export const config = {}'],
    ['spread', "const defaults = { title: 'Default' }; export const config = { ...defaults }"],
    [
      'title before spread',
      "const defaults = { title: 'Default' }; export const config = { title: 'Old', ...defaults }"
    ],
    [
      'shorthand before spread',
      "const title = 'Old'; const defaults = { title: 'Default' }; export const config = { title, ...defaults }"
    ],
    [
      'title after spread',
      "const defaults = { title: 'Default' }; export const config = { ...defaults, title: 'Old' }"
    ],
    [
      'trailing comma',
      "const defaults = { title: 'Default' }; export const config = { 'title': 'Old', ...defaults, }"
    ],
    ['as const', "export const config = { title: 'Old' } as const"],
    ['satisfies', "export const config = { title: 'Old' } as const satisfies { title: string }"]
  ]

  for (const [index, [name, source]] of runtimeCases.entries()) {
    test(`keeps the compiled metadata and runtime title in sync: ${name}`, async () => {
      const updated = setViewSourceTitle(source, escaped)
      // Bun caches directory listings after the first import. Reuse a known
      // file with a distinct module URL so every case executes its latest code.
      const path = join(directory, 'runtime.ts')
      await writeFile(path, updated)
      const module: { config: { title: string } } = await import(`${path}?case=${index}`)
      expect(module.config.title).toBe(escaped)
      expect(await extractViewConfig(path)).toMatchObject({ title: escaped })
      // Once an overriding title is in place, subsequent renames replace it.
      expect(setViewSourceTitle(updated, escaped)).toBe(updated)
    })
  }

  test('preserves comments and other properties when moving the title after a spread', async () => {
    const source = `const defaults = { title: 'Default' }
export const config = {
  title: 'Old' /* a comma, inside a comment */, // title note
  ...defaults,
  icon: 'chart' // keep this note
}
export const untouched = true
`
    const updated = setViewSourceTitle(source, 'New')
    expect(updated).not.toContain("title: 'Old'")
    expect(updated).toContain('/* a comma, inside a comment */')
    expect(updated).toContain('// title note')
    expect(updated).toContain("icon: 'chart', // keep this note")
    expect(updated).toContain('export const untouched = true')
    const path = join(directory, 'runtime.ts')
    await writeFile(path, updated)
    const module: { config: { title: string; icon: string } } = await import(
      `${path}?case=comments`
    )
    expect(module.config).toEqual({ title: 'New', icon: 'chart' })
    expect(await extractViewConfig(path)).toEqual(module.config)
  })

  test('the compiler recognizes quoted and computed string keys for both applet kinds', async () => {
    const path = join(directory, 'quoted.ts')
    await writeFile(
      path,
      "export const config = { 'title': 'Cards', ['icon']: 'chart', 'rowSpan': 2, ['colSpan']: 3, 'requiredEnv': ['API_KEY'] }"
    )
    expect(await extractViewConfig(path)).toEqual({
      title: 'Cards',
      icon: 'chart',
      requiredEnv: ['API_KEY']
    })
    expect(await extractWidgetConfig(path)).toEqual({
      rowSpan: 2,
      colSpan: 3,
      requiredEnv: ['API_KEY']
    })
  })

  test('does not treat a computed variable name as a literal config key', async () => {
    const path = join(directory, 'computed.ts')
    await writeFile(
      path,
      "const title = 'somethingElse'; export const config = { [title]: 'Not a title' }"
    )
    expect(await extractViewConfig(path)).toEqual({})
  })
})
