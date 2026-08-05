import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'path'

import {
  COLOR_THEMES,
  DEFAULT_WORKSPACE_THEME,
  RADIUS_THEMES,
  deriveThemeColors,
  resolveWorkspaceTheme
} from '@/lib/themes'
import type { WorkspaceLayout } from '@/lib/types'

import { loadLayout, saveLayout } from '../layout'
import { applyThemeUpdate } from '../theme'

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
  test('keeps the picker order', () => {
    expect(Object.keys(COLOR_THEMES)).toEqual([
      'default',
      'paper',
      'rose',
      'tangerine',
      'sand',
      'mint',
      'sky',
      'lavender'
    ])
  })

  test('derives all theme colors from the primary', () => {
    expect(deriveThemeColors('#eab308')).toEqual({
      primary: '#eab308',
      primaryForeground: '#000000',
      background: 'color-mix(in oklch, var(--primary) 3%, white 97%)',
      foreground: 'color-mix(in oklch, var(--primary) 24%, black 76%)',
      muted: 'color-mix(in oklch, var(--background) 95%, var(--foreground) 5%)',
      mutedForeground: 'color-mix(in oklch, var(--background) 58%, var(--foreground) 42%)',
      accent: 'color-mix(in oklch, var(--primary) 4%, var(--foreground) 4%)'
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

  test('requires primary colors to use six-digit hex', () => {
    expect(() => deriveThemeColors('#fff')).toThrow('Primary theme color must use #rrggbb: #fff')
    expect(() => deriveThemeColors('rgb(255, 255, 255)')).toThrow(
      'Primary theme color must use #rrggbb: rgb(255, 255, 255)'
    )
  })

  test('stores only the primary source on color presets', () => {
    expect(COLOR_THEMES.default).toEqual({ label: 'Default' })
    for (const [key, preset] of Object.entries(COLOR_THEMES)) {
      if (key === 'default') continue
      expect(Object.keys(preset).sort()).toEqual(['label', 'primary'])
    }
  })
})

describe('radius themes', () => {
  test('defines the four shared radius presets', () => {
    expect(RADIUS_THEMES).toEqual({
      squishy: { label: 'Squishy', radius: '0.875rem' },
      rounded: { label: 'Rounded', radius: '0.625rem' },
      subtle: { label: 'Subtle', radius: '0.375rem' },
      square: { label: 'Square', radius: '0' }
    })
  })
})

describe('applyThemeUpdate', () => {
  test('setting one option preserves the others', () => {
    const current = {
      font: 'default' as const,
      color: 'paper' as const,
      radius: 'squishy' as const
    }
    const result = applyThemeUpdate(current, { font: 'serif' })
    if (!result.ok) throw new Error('expected ok')
    expect(result.theme).toEqual({ font: 'serif', color: 'paper', radius: 'squishy' })
    expect(result.applied).toEqual({ font: 'serif' })
  })

  test('setting color uses its preset key', () => {
    const current = { font: 'mono' as const, color: 'default' as const, radius: 'subtle' as const }
    const result = applyThemeUpdate(current, { color: 'paper' })
    if (!result.ok) throw new Error('expected ok')
    expect(result.theme).toEqual({ font: 'mono', color: 'paper', radius: 'subtle' })
    expect(result.applied).toEqual({ color: 'paper' })
  })

  test("'default' remains an explicit preset", () => {
    const current = { font: 'serif' as const, color: 'paper' as const, radius: 'rounded' as const }
    const result = applyThemeUpdate(current, { color: 'default' })
    if (!result.ok) throw new Error('expected ok')
    expect(result.theme).toEqual({ font: 'serif', color: 'default', radius: 'rounded' })
  })

  test('combined font + color updates apply both', () => {
    const result = applyThemeUpdate(undefined, {
      font: 'serif',
      color: 'mint',
      radius: 'square'
    })
    if (!result.ok) throw new Error('expected ok')
    expect(result.theme).toEqual({ font: 'serif', color: 'mint', radius: 'square' })
    expect(result.applied).toEqual({ font: 'serif', color: 'mint', radius: 'square' })
  })

  test('fills missing options with the workspace defaults', () => {
    const result = applyThemeUpdate(undefined, { color: 'paper' })
    if (!result.ok) throw new Error('expected ok')
    expect(result.theme).toEqual({ ...DEFAULT_WORKSPACE_THEME, color: 'paper' })
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

  test("'rounded' remains an explicit preset", () => {
    const current = { font: 'serif' as const, color: 'rose' as const, radius: 'squishy' as const }
    const result = applyThemeUpdate(current, { radius: 'rounded' })
    if (!result.ok) throw new Error('expected ok')
    expect(result.theme).toEqual({ font: 'serif', color: 'rose', radius: 'rounded' })
    expect(result.applied).toEqual({ radius: 'rounded' })
  })

  test('rejects unknown radius key', () => {
    const result = applyThemeUpdate(undefined, { radius: 'pillowy' })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected error')
    expect(result.error).toContain('pillowy')
  })
})

describe('resolveWorkspaceTheme', () => {
  test('returns one complete default theme', () => {
    expect(resolveWorkspaceTheme()).toEqual(DEFAULT_WORKSPACE_THEME)
  })

  test('fills missing preset keys', () => {
    expect(resolveWorkspaceTheme({ font: 'serif' })).toEqual({
      font: 'serif',
      color: 'default',
      radius: 'rounded'
    })
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

  test('persists the selected preset keys', async () => {
    const layout: WorkspaceLayout = {
      version: 1,
      widgetGrid: [],
      layoutMode: 'fullscreen',
      tabs: { open: ['agent'], active: 'agent' },
      theme: {
        font: 'serif',
        color: 'paper',
        radius: 'subtle'
      }
    }
    await saveLayout(layout, tmpDir)
    const loaded = await loadLayout(tmpDir)
    expect(loaded.theme).toEqual(layout.theme)
  })

  test('persists the complete default theme', async () => {
    const layout: WorkspaceLayout = {
      version: 1,
      widgetGrid: [],
      layoutMode: 'fullscreen',
      tabs: { open: ['agent'], active: 'agent' },
      theme: DEFAULT_WORKSPACE_THEME
    }
    await saveLayout(layout, tmpDir)
    const loaded = await loadLayout(tmpDir)
    expect(loaded.theme).toEqual(DEFAULT_WORKSPACE_THEME)
  })
})
