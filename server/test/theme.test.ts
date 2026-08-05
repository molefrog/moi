import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { formatHex, wcagContrast } from 'culori'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'path'

import {
  COLOR_THEMES,
  DEFAULT_PRIMARY_COLOR,
  DEFAULT_WORKSPACE_THEME,
  RADIUS_THEMES,
  deriveThemeColors,
  resolveWorkspaceTheme
} from '@/lib/themes'
import type { WorkspaceLayout } from '@/lib/types'

import { loadLayout, saveLayout } from '../layout'
import { applyThemeUpdate } from '../theme'

describe('color themes', () => {
  test('keeps the default primary source aligned with the root theme', async () => {
    const css = await Bun.file(join(import.meta.dir, '../../client/index.css')).text()

    expect(css).toContain(`--primary: ${DEFAULT_PRIMARY_COLOR};`)
  })

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
    const primary = 'oklch(0.7426 0.1817 56.01)'
    expect(deriveThemeColors(primary)).toEqual({
      primary,
      primaryForeground: 'oklch(0 0 0)',
      background: 'color-mix(var(--primary) 3%, oklch(1 0 0) 97%)',
      foreground: 'color-mix(var(--primary) 20%, oklch(0 0 0) 80%)',
      muted: 'color-mix(var(--background) 95%, var(--foreground) 5%)',
      mutedForeground: 'color-mix(var(--background) 50%, var(--foreground) 50%)',
      accent: 'color-mix(var(--primary) 4%, var(--foreground) 4%)',
      accentForeground: 'var(--foreground)',
      border: 'color-mix(var(--foreground) 7%, transparent)'
    })
  })

  test('swaps the primary pair into the widget surface roles', () => {
    const primary = 'oklch(0.7426 0.1817 56.01)'
    const colors = deriveThemeColors(primary, 'widget')

    expect(colors).toEqual({
      primary: 'color-mix(var(--background) 3%, oklch(1 0 0) 97%)',
      primaryForeground: 'color-mix(var(--background) 20%, oklch(0 0 0) 80%)',
      background: primary,
      foreground: 'oklch(0 0 0)',
      muted: 'color-mix(var(--background) 95%, var(--foreground) 5%)',
      mutedForeground: 'color-mix(var(--background) 50%, var(--foreground) 50%)',
      accent: 'color-mix(var(--primary) 4%, var(--foreground) 4%)',
      accentForeground: 'var(--foreground)',
      border: 'color-mix(var(--foreground) 15%, transparent)'
    })
    expect(colors.primary).not.toContain('var(--primary)')
    expect(deriveThemeColors(DEFAULT_PRIMARY_COLOR, 'widget').background).toBe(
      DEFAULT_PRIMARY_COLOR
    )
  })

  test('chooses primary text using the UI luminance threshold', () => {
    const expectedForegrounds = {
      paper: 'oklch(1 0 0)',
      rose: 'oklch(1 0 0)',
      tangerine: 'oklch(1 0 0)',
      sand: 'oklch(0 0 0)',
      mint: 'oklch(1 0 0)',
      sky: 'oklch(1 0 0)',
      lavender: 'oklch(1 0 0)'
    }

    for (const [key, preset] of Object.entries(COLOR_THEMES)) {
      if (!preset.primary || key === 'default') continue
      const foreground = deriveThemeColors(preset.primary).primaryForeground
      expect(foreground).toBe(expectedForegrounds[key as keyof typeof expectedForegrounds])
      expect(wcagContrast(preset.primary, foreground)).toBeGreaterThanOrEqual(3)
    }
  })

  test('serializes the OKLCH presets for terminal swatches', () => {
    const expectedHex = {
      paper: '#5e4d3c',
      rose: '#f13c3c',
      tangerine: '#ff5718',
      sand: '#ffb868',
      mint: '#009155',
      sky: '#007ae3',
      lavender: '#9051ff'
    }

    for (const [key, hex] of Object.entries(expectedHex)) {
      const primary = COLOR_THEMES[key as keyof typeof expectedHex].primary
      if (!primary) throw new Error(`expected ${key} primary`)
      expect(formatHex(primary)).toBe(hex)
    }
  })

  test('stores only the primary source on color presets', () => {
    expect(COLOR_THEMES.default).toEqual({ label: 'Default' })
    for (const [key, preset] of Object.entries(COLOR_THEMES)) {
      if (key === 'default') continue
      expect(Object.keys(preset).sort()).toEqual(['label', 'primary'])
      expect(preset.primary).toMatch(/^oklch\(/)
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
