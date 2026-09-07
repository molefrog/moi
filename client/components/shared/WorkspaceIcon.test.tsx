import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'

import { COLOR_THEMES, DEFAULT_PRIMARY_COLOR, deriveThemeColors } from '@/lib/themes'

import { WorkspaceIcon, workspaceProviderIcon } from './WorkspaceIcon'

test('workspace icon paints themed glyphs with primary foreground', () => {
  const html = renderToStaticMarkup(
    <WorkspaceIcon
      icon={{ type: 'glyph', value: 'rocket', background: 'theme' }}
      workspaceType="codex"
      workspaceTheme={{ font: 'sans', color: 'rose', radius: 'soft', agent: 'boxy' }}
      className="size-7 rounded-xs"
    />
  )

  expect(html).toContain('shadow-[inset')
  expect(html).toContain(`background-color:${COLOR_THEMES.rose.primary}`)
  expect(html).toContain(
    `color:${deriveThemeColors(COLOR_THEMES.rose.primary ?? DEFAULT_PRIMARY_COLOR).primaryForeground}`
  )
  expect(html).toContain('size-[70%]')
  expect(html).toContain('<svg')
})

test('workspace icon keeps uploads and provider fallbacks plain', () => {
  const upload = renderToStaticMarkup(
    <WorkspaceIcon
      icon={{ type: 'upload', value: 'data:image/webp;base64,upload' }}
      workspaceType="codex"
    />
  )
  const provider = renderToStaticMarkup(<WorkspaceIcon workspaceType="codex" />)

  expect(upload).not.toContain('color-mix(in_srgb')
  expect(upload).not.toContain('style=')
  expect(provider).toContain(`src="${workspaceProviderIcon.codex}"`)
  expect(provider).not.toContain('color-mix(in_srgb')
})

test('bare glyphs use the workspace foreground', () => {
  const html = renderToStaticMarkup(<WorkspaceIcon icon={{ type: 'glyph', value: 'leaf' }} />)

  expect(html).toContain('text-foreground')
  expect(html).not.toContain('text-primary-foreground')
  expect(html).toContain('size-[95%]')
  expect(html).not.toContain('<img')
})

test('emoji stay as text and change size with their background', () => {
  const bare = renderToStaticMarkup(<WorkspaceIcon icon={{ type: 'emoji', value: '💡' }} />)
  const html = renderToStaticMarkup(
    <WorkspaceIcon icon={{ type: 'emoji', value: '💡', background: 'theme' }} />
  )

  expect(bare).toContain('text-[85cqi]')
  expect(html).toContain('text-[60cqi]')
  expect(html).toContain('💡')
  expect(html).not.toContain('<img')
})

test('workspace icon scopes the default primary instead of inheriting another workspace', () => {
  const html = renderToStaticMarkup(
    <WorkspaceIcon icon={{ type: 'glyph', value: 'rocket', background: 'theme' }} />
  )

  expect(html).toContain(`background-color:${DEFAULT_PRIMARY_COLOR}`)
})
