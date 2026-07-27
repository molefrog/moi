import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'path'

import { COLOR_THEMES, deriveThemeColors } from '@/lib/themes'
import type { WorkspaceLayout } from '@/lib/types'

import { loadLayout, saveLayout } from '../layout'
import { applyThemeUpdate, matchColorTheme } from '../theme'

describe('color themes', () => {
  test('derives all theme colors from the background and foreground', () => {
    expect(deriveThemeColors({ background: '#fdf2f4', foreground: '#3b1c26' })).toEqual({
      background: '#fdf2f4',
      foreground: '#3b1c26',
      muted: 'color-mix(in oklch, #fdf2f4 95%, #3b1c26 5%)',
      accent: 'color-mix(in oklch, oklch(from #fdf2f4 l calc(c * 10) h) 8%, #3b1c26 6%)'
    })
  })

  test('leaves the default theme on the root color tokens', () => {
    expect(COLOR_THEMES.default.muted).toBeUndefined()
    expect(COLOR_THEMES.default.accent).toBeUndefined()
  })

  test('stores the generated supporting tokens on each color preset', () => {
    expect(COLOR_THEMES.rose.muted).toBe('color-mix(in oklch, #fdf2f4 95%, #3b1c26 5%)')
    expect(COLOR_THEMES.rose.accent).toBe(
      'color-mix(in oklch, oklch(from #fdf2f4 l calc(c * 10) h) 8%, #3b1c26 6%)'
    )
  })
})

describe('applyThemeUpdate', () => {
  test('setting font preserves existing background/foreground (regression guard)', () => {
    const current = { font: 'default' as const, background: '#faf8f5', foreground: '#2c2825' }
    const result = applyThemeUpdate(current, { font: 'serif' })
    if (!result.ok) throw new Error('expected ok')
    expect(result.theme.font).toBe('serif')
    expect(result.theme.background).toBe('#faf8f5')
    expect(result.theme.foreground).toBe('#2c2825')
    expect(result.applied).toEqual({ font: 'serif' })
  })

  test('setting color preserves existing font', () => {
    const current = { font: 'mono' as const }
    const result = applyThemeUpdate(current, { color: 'paper' })
    if (!result.ok) throw new Error('expected ok')
    expect(result.theme.font).toBe('mono')
    expect(result.theme.background).toBe('#faf8f5')
    expect(result.theme.foreground).toBe('#2c2825')
    expect(result.theme.muted).toBe(COLOR_THEMES.paper.muted)
    expect(result.theme.accent).toBe(COLOR_THEMES.paper.accent)
    expect(result.applied).toEqual({ color: 'paper' })
  })

  test("'default' color clears overrides (undefined values drop via JSON.stringify)", () => {
    const current = {
      font: 'serif' as const,
      background: '#faf8f5',
      foreground: '#2c2825',
      muted: COLOR_THEMES.paper.muted,
      accent: COLOR_THEMES.paper.accent
    }
    const result = applyThemeUpdate(current, { color: 'default' })
    if (!result.ok) throw new Error('expected ok')
    expect(result.theme.background).toBeUndefined()
    expect(result.theme.foreground).toBeUndefined()
    expect(result.theme.muted).toBeUndefined()
    expect(result.theme.accent).toBeUndefined()
    expect(result.theme.font).toBe('serif')

    // Round-trip: undefined values should not survive JSON serialization
    const roundTripped = JSON.parse(JSON.stringify(result.theme))
    expect('background' in roundTripped).toBe(false)
    expect('foreground' in roundTripped).toBe(false)
    expect('muted' in roundTripped).toBe(false)
    expect('accent' in roundTripped).toBe(false)
  })

  test('combined font + color updates apply both', () => {
    const result = applyThemeUpdate(undefined, { font: 'serif', color: 'mint' })
    if (!result.ok) throw new Error('expected ok')
    expect(result.theme.font).toBe('serif')
    expect(result.theme.background).toBe('#f0faf6')
    expect(result.theme.muted).toBe(COLOR_THEMES.mint.muted)
    expect(result.theme.accent).toBe(COLOR_THEMES.mint.accent)
    expect(result.applied).toEqual({ font: 'serif', color: 'mint' })
  })

  test('falls back to default font when no current and none provided', () => {
    const result = applyThemeUpdate(undefined, { color: 'paper' })
    if (!result.ok) throw new Error('expected ok')
    expect(result.theme.font).toBe('default')
  })

  test('rejects unknown font key', () => {
    const result = applyThemeUpdate(undefined, { font: 'comic-sans' })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected error')
    expect(result.error).toContain('comic-sans')
  })

  test('rejects unknown color key', () => {
    const result = applyThemeUpdate(undefined, { color: 'neon' })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected error')
    expect(result.error).toContain('neon')
  })
})

describe('matchColorTheme', () => {
  test('no overrides maps to default', () => {
    expect(matchColorTheme(undefined, undefined)).toBe('default')
  })

  test('matching hex maps to preset key', () => {
    expect(matchColorTheme('#faf8f5', '#2c2825')).toBe('paper')
    expect(matchColorTheme('#f0faf6', '#1a3028')).toBe('mint')
  })

  test('non-matching custom values return null', () => {
    expect(matchColorTheme('#123456', '#abcdef')).toBe(null)
  })

  test('half-matching (bg only) returns null', () => {
    expect(matchColorTheme('#faf8f5', undefined)).toBe(null)
  })
})

describe('loadLayout/saveLayout round-trip with theme', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'moi-theme-test-'))
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  test('persists font + color overrides and reads them back', async () => {
    const layout: WorkspaceLayout = {
      version: 1,
      widgetGrid: [],
      layoutMode: 'fullscreen',
      tabs: { open: ['agent'], active: 'agent' },
      theme: {
        font: 'serif',
        background: '#faf8f5',
        foreground: '#2c2825',
        muted: COLOR_THEMES.paper.muted,
        accent: COLOR_THEMES.paper.accent
      }
    }
    await saveLayout(layout, tmpDir)
    const loaded = await loadLayout(tmpDir)
    expect(loaded.theme).toEqual(layout.theme)
  })

  test('theme without overrides persists as minimal shape', async () => {
    const layout: WorkspaceLayout = {
      version: 1,
      widgetGrid: [],
      layoutMode: 'fullscreen',
      tabs: { open: ['agent'], active: 'agent' },
      theme: { font: 'default' }
    }
    await saveLayout(layout, tmpDir)
    const loaded = await loadLayout(tmpDir)
    expect(loaded.theme).toEqual({ font: 'default' })
    expect('background' in (loaded.theme ?? {})).toBe(false)
  })
})
