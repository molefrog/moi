import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'path'

import { COLOR_THEMES, deriveThemeColors } from '@/lib/themes'
import type { WorkspaceLayout } from '@/lib/types'

import { loadLayout, saveLayout } from '../layout'
import { applyThemeUpdate, matchColorTheme } from '../theme'

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map(index => {
    const channel = Number.parseInt(hex.slice(index, index + 2), 16) / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

function contrastRatio(first: string, second: string): number {
  const lighter = Math.max(relativeLuminance(first), relativeLuminance(second))
  const darker = Math.min(relativeLuminance(first), relativeLuminance(second))
  return (lighter + 0.05) / (darker + 0.05)
}

describe('color themes', () => {
  test('derives all theme colors from the primary', () => {
    expect(deriveThemeColors('#eab308')).toEqual({
      primary: '#eab308',
      primaryForeground: '#000000',
      background: 'color-mix(in oklch, var(--primary) 3%, white 97%)',
      foreground: 'color-mix(in oklch, var(--primary) 24%, black 76%)',
      muted: 'color-mix(in oklch, var(--background) 95%, var(--foreground) 5%)',
      mutedForeground: 'color-mix(in oklch, var(--background) 58%, var(--foreground) 42%)',
      accent: 'color-mix(in oklch, var(--primary) 5%, var(--foreground) 5%)'
    })
  })

  test('chooses primary text using the UI luminance threshold', () => {
    expect(deriveThemeColors('#eab308').primaryForeground).toBe('#000000')
    expect(deriveThemeColors('#e11d48').primaryForeground).toBe('#ffffff')
    expect(deriveThemeColors('#7c3aed').primaryForeground).toBe('#ffffff')
    expect(deriveThemeColors('#059669').primaryForeground).toBe('#ffffff')
    expect(deriveThemeColors('#2563eb').primaryForeground).toBe('#ffffff')

    for (const preset of Object.values(COLOR_THEMES)) {
      if (!preset.primary) continue
      const foreground = deriveThemeColors(preset.primary).primaryForeground
      expect(contrastRatio(preset.primary, foreground)).toBeGreaterThanOrEqual(3)
    }
  })

  test('stores only the primary source on color presets', () => {
    expect(COLOR_THEMES.default).toEqual({ label: 'Default' })
    for (const [key, preset] of Object.entries(COLOR_THEMES)) {
      if (key === 'default') continue
      expect(Object.keys(preset).sort()).toEqual(['label', 'primary'])
    }
  })
})

describe('applyThemeUpdate', () => {
  test('setting font preserves the existing primary', () => {
    const current = { font: 'default' as const, primary: '#123456' }
    const result = applyThemeUpdate(current, { font: 'serif' })
    if (!result.ok) throw new Error('expected ok')
    expect(result.theme).toEqual({ font: 'serif', primary: '#123456' })
    expect(result.applied).toEqual({ font: 'serif' })
  })

  test('setting color preserves existing font', () => {
    const current = { font: 'mono' as const }
    const result = applyThemeUpdate(current, { color: 'paper' })
    if (!result.ok) throw new Error('expected ok')
    expect(result.theme).toEqual({
      font: 'mono',
      primary: COLOR_THEMES.paper.primary
    })
    expect(result.applied).toEqual({ color: 'paper' })
  })

  test("'default' color clears the primary", () => {
    const current = {
      font: 'serif' as const,
      primary: COLOR_THEMES.paper.primary
    }
    const result = applyThemeUpdate(current, { color: 'default' })
    if (!result.ok) throw new Error('expected ok')
    expect(result.theme).toEqual({ font: 'serif' })
    expect(JSON.parse(JSON.stringify(result.theme))).toEqual({ font: 'serif' })
  })

  test('combined font + color updates apply both', () => {
    const result = applyThemeUpdate(undefined, { font: 'serif', color: 'mint' })
    if (!result.ok) throw new Error('expected ok')
    expect(result.theme).toEqual({
      font: 'serif',
      primary: COLOR_THEMES.mint.primary
    })
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
    expect(matchColorTheme(undefined)).toBe('default')
  })

  test('matching primary colors map to preset keys', () => {
    expect(matchColorTheme(COLOR_THEMES.paper.primary)).toBe('paper')
    expect(matchColorTheme(COLOR_THEMES.mint.primary)).toBe('mint')
  })

  test('non-matching custom values return null', () => {
    expect(matchColorTheme('#123456')).toBe(null)
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

  test('persists the font and primary source', async () => {
    const layout: WorkspaceLayout = {
      version: 1,
      widgetGrid: [],
      layoutMode: 'fullscreen',
      tabs: { open: ['agent'], active: 'agent' },
      theme: {
        font: 'serif',
        primary: COLOR_THEMES.paper.primary
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
    expect('primary' in (loaded.theme ?? {})).toBe(false)
  })
})
