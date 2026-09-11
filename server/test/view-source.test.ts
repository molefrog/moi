import { afterAll, describe, expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { extractViewConfig } from '../bundler/build-applet'
import { setViewSourceTitle } from '../view-source'

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
})
