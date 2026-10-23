import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { checkFiles } from './check-repo'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function fixture(files: Record<string, string>) {
  const root = await mkdtemp(join(tmpdir(), 'moi-repo-check-'))
  roots.push(root)
  for (const [file, contents] of Object.entries(files)) await Bun.write(join(root, file), contents)
  return root
}

test('checks reference links, images, HTML links, and GitHub heading fragments', async () => {
  const files = {
    'README.md':
      '[Guide][guide]\n\n[guide]: guide.md#oauth--sso\n\n![Image](image.svg)\n<a href="guide.md#repeat-1">Again</a>\n[Root](/)\n[Encoded](guide%2Emd#repeat)',
    'guide.md': '# OAuth / SSO\n## Repeat\n## Repeat',
    'image.svg': '<svg />'
  }
  const root = await fixture(files)
  expect(await checkFiles(root, Object.keys(files))).toEqual([])
  await rm(join(root, 'guide.md'))
  const errors = await checkFiles(root, ['README.md', 'image.svg'])
  expect(errors.filter(error => error.includes('missing local target'))).toHaveLength(3)
})

test('reports missing files, headings, and wrong case while ignoring code examples and URLs', async () => {
  const files = {
    'README.md':
      '[Missing](removed.md)\n[Heading](guide.md#gone)\n[Case](Guide.md)\n![Image](gone.svg)\n`[Example](example.md)`\n```md\n[Example](example.md)\n```\n[Site](https://example.com)\n[View](moi:/views/demo)',
    'guide.md': '# Present'
  }
  const root = await fixture(files)
  const errors = await checkFiles(root, Object.keys(files))
  expect(errors).toHaveLength(4)
  expect(errors).toContain('README.md: missing heading guide.md#gone')
  expect(errors).toContain('README.md: missing local target Guide.md')
})

test('rejects mixed-case source paths and accepts test suffixes and conventional names', async () => {
  const files = [
    'client/ChatPanel.tsx',
    'client/useChat.ts',
    'lib/bad_folder/item.ts',
    'client/chat-panel.test.tsx',
    'server/test/__fixtures__/hello.tsx',
    'AGENTS.md'
  ]
  const root = await fixture({ 'AGENTS.md': '# Instructions' })
  expect(await checkFiles(root, files)).toHaveLength(3)
})
