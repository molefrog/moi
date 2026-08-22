import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { formatHex, wcagContrast } from 'culori'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'path'

import {
  AGENT_THEMES,
  COLOR_THEMES,
  DEFAULT_PRIMARY_COLOR,
  DEFAULT_WORKSPACE_THEME,
  RADIUS_THEMES,
  deriveThemeColors,
  resolveWorkspaceTheme
} from '@/lib/themes'
import type { WorkspaceLayout, WorkspaceTheme } from '@/lib/types'

import { loadLayout, saveLayout } from '../layout'
import { applyThemeUpdate } from '../theme'

describe('color themes', () => {
  test('keeps the default primary source aligned with the root theme', async () => {
    const css = await Bun.file(join(import.meta.dir, '../../client/index.css')).text()

    expect(css).toContain(`--primary: ${DEFAULT_PRIMARY_COLOR};`)
  })

  // index.html carries a hardcoded first-paint background, because the
  // stylesheet that defines `--muted` is render-blocking and the browser would
  // otherwise paint its white canvas first. A literal cannot follow the token,
  // so pin them together here — drift shows up as a white flash on cold loads,
  // which nothing else would catch.
  test('keeps the shell first-paint background aligned with --muted', async () => {
    const html = await Bun.file(join(import.meta.dir, '../../client/index.html')).text()
    const indexCss = await Bun.file(join(import.meta.dir, '../../client/index.css')).text()

    const shellBackground = html.match(/html \{\s*background:\s*([^;]+);/)?.[1]?.trim()
    const root = indexCss.match(/:root \{([\s\S]*?)\n\}/)?.[1]
    const muted = root?.match(/--muted:\s*([^;]+);/)?.[1]?.trim()

    expect(shellBackground).toBeDefined()
    expect(muted).toBeDefined()
    expect(shellBackground).toBe(muted)
    expect(html).toContain('<meta name="color-scheme" content="light" />')
  })

  test('defines and exposes the default shadcn compatibility tokens', async () => {
    const indexCss = await Bun.file(join(import.meta.dir, '../../client/index.css')).text()
    const themeCss = await Bun.file(join(import.meta.dir, '../../client/theme.css')).text()
    const root = indexCss.match(/:root \{([\s\S]*?)\n\}/)?.[1]
    const darkTheme = indexCss.match(/\.dark \{([\s\S]*?)\n\}/)?.[1]
    const light = [
      'oklch(0.646 0.222 41.116)',
      'oklch(0.6 0.118 184.704)',
      'oklch(0.398 0.07 227.392)',
      'oklch(0.828 0.189 84.429)',
      'oklch(0.769 0.188 70.08)'
    ]
    const dark = [
      'oklch(0.488 0.243 264.376)',
      'oklch(0.696 0.17 162.48)',
      'oklch(0.769 0.188 70.08)',
      'oklch(0.627 0.265 303.9)',
      'oklch(0.645 0.246 16.439)'
    ]

    expect(root).toContain('--secondary: var(--accent);')
    expect(root).toContain('--secondary-foreground: var(--accent-foreground);')
    expect(darkTheme).toContain('--secondary: var(--accent);')
    expect(darkTheme).toContain('--secondary-foreground: var(--accent-foreground);')
    expect(themeCss).toContain('--color-secondary: var(--secondary);')
    expect(themeCss).toContain('--color-secondary-foreground: var(--secondary-foreground);')

    for (const [index, color] of light.entries()) {
      const token = index + 1
      expect(root).toContain(`--chart-${token}: ${color};`)
      expect(themeCss).toContain(`--color-chart-${token}: var(--chart-${token});`)
    }
    for (const [index, color] of dark.entries()) {
      expect(darkTheme).toContain(`--chart-${index + 1}: ${color};`)
    }
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
      background: 'color-mix(in srgb, var(--primary) 3%, oklch(1 0 0) 97%)',
      foreground: 'color-mix(in srgb, var(--primary) 20%, oklch(0 0 0) 80%)',
      muted: 'color-mix(in srgb, var(--background) 97%, var(--foreground) 3%)',
      mutedForeground: 'color-mix(in srgb, var(--background) 50%, var(--foreground) 50%)',
      accent: 'color-mix(in srgb, var(--primary) 4%, var(--foreground) 4%)',
      accentForeground: 'var(--foreground)',
      border: 'color-mix(in srgb, var(--foreground) 7%, transparent)',
      ring: 'color-mix(in srgb, var(--background) 50%, var(--primary) 50%)'
    })
  })

  test('swaps the primary pair into the widget surface roles', () => {
    const primary = 'oklch(0.7426 0.1817 56.01)'
    const colors = deriveThemeColors(primary, 'widget')

    expect(colors).toEqual({
      primary: 'color-mix(in srgb, var(--background) 3%, oklch(1 0 0) 97%)',
      primaryForeground: 'color-mix(in srgb, var(--background) 20%, oklch(0 0 0) 80%)',
      background: primary,
      foreground: 'oklch(0 0 0)',
      muted: 'color-mix(in srgb, var(--background) 97%, var(--foreground) 3%)',
      mutedForeground: 'color-mix(in srgb, var(--background) 50%, var(--foreground) 50%)',
      accent: 'color-mix(in srgb, var(--primary) 4%, var(--foreground) 4%)',
      accentForeground: 'var(--foreground)',
      border: 'color-mix(in srgb, var(--foreground) 15%, transparent)',
      ring: 'color-mix(in srgb, var(--background) 50%, var(--primary) 50%)'
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
      soft: { label: 'Soft', radius: '0.625rem' },
      subtle: { label: 'Subtle', radius: '0.375rem' },
      square: { label: 'Square', radius: '0' }
    })
  })
})

describe('agent themes', () => {
  test('defines the four fixed Blobatar presets', () => {
    expect(AGENT_THEMES).toEqual({
      blob: {
        label: 'Blob',
        traits: { shape: 0.11, 'body.r': 0.25, 'body.ratio': 0, 'body.n': 0.5 }
      },
      boxy: { label: 'Boxy', traits: { shape: 0.54, 'body.r': 1, 'body.ratio': 0 } },
      pill: { label: 'Pill', traits: { shape: 0.65, 'body.r': 1 } },
      dorito: {
        label: 'Dorito',
        traits: { shape: 0.99, 'body.r': 1, 'body.ratio': 0, 'body.rot': 0 }
      }
    })
  })
})

describe('applyThemeUpdate', () => {
  test('setting one option preserves the others', () => {
    const current = {
      font: 'sans' as const,
      color: 'paper' as const,
      radius: 'squishy' as const,
      agent: 'dorito' as const
    }
    const result = applyThemeUpdate(current, { font: 'serif' })
    if (!result.ok) throw new Error('expected ok')
    expect(result.theme).toEqual({
      font: 'serif',
      color: 'paper',
      radius: 'squishy',
      agent: 'dorito'
    })
    expect(result.applied).toEqual({ font: 'serif' })
  })

  test('setting color uses its preset key', () => {
    const current = {
      font: 'mono' as const,
      color: 'default' as const,
      radius: 'subtle' as const,
      agent: 'blob' as const
    }
    const result = applyThemeUpdate(current, { color: 'paper' })
    if (!result.ok) throw new Error('expected ok')
    expect(result.theme).toEqual({
      font: 'mono',
      color: 'paper',
      radius: 'subtle',
      agent: 'blob'
    })
    expect(result.applied).toEqual({ color: 'paper' })
  })

  test("'sans' remains an explicit font preset", () => {
    const current = {
      font: 'serif' as const,
      color: 'paper' as const,
      radius: 'soft' as const,
      agent: 'boxy' as const
    }
    const result = applyThemeUpdate(current, { font: 'sans' })
    if (!result.ok) throw new Error('expected ok')
    expect(result.theme).toEqual({
      font: 'sans',
      color: 'paper',
      radius: 'soft',
      agent: 'boxy'
    })
  })

  test('combined font + color updates apply both', () => {
    const result = applyThemeUpdate(undefined, {
      font: 'serif',
      color: 'mint',
      radius: 'square',
      agent: 'pill'
    })
    if (!result.ok) throw new Error('expected ok')
    expect(result.theme).toEqual({
      font: 'serif',
      color: 'mint',
      radius: 'square',
      agent: 'pill'
    })
    expect(result.applied).toEqual({
      font: 'serif',
      color: 'mint',
      radius: 'square',
      agent: 'pill'
    })
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

  test("'soft' remains an explicit preset", () => {
    const current = {
      font: 'serif' as const,
      color: 'rose' as const,
      radius: 'squishy' as const,
      agent: 'dorito' as const
    }
    const result = applyThemeUpdate(current, { radius: 'soft' })
    if (!result.ok) throw new Error('expected ok')
    expect(result.theme).toEqual({
      font: 'serif',
      color: 'rose',
      radius: 'soft',
      agent: 'dorito'
    })
    expect(result.applied).toEqual({ radius: 'soft' })
  })

  test('rejects unknown radius key', () => {
    const result = applyThemeUpdate(undefined, { radius: 'pillowy' })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected error')
    expect(result.error).toContain('pillowy')
  })

  test('setting agent uses its preset key', () => {
    const result = applyThemeUpdate(undefined, { agent: 'dorito' })
    if (!result.ok) throw new Error('expected ok')
    expect(result.theme).toEqual({ ...DEFAULT_WORKSPACE_THEME, agent: 'dorito' })
    expect(result.applied).toEqual({ agent: 'dorito' })
  })

  test('rejects unknown agent key', () => {
    const result = applyThemeUpdate(undefined, { agent: 'cloud' })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected error')
    expect(result.error).toContain('cloud')
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
      radius: 'soft',
      agent: 'boxy'
    })
  })

  test('falls back from unknown saved preset keys', () => {
    const unknownTheme = {
      font: 'legacy',
      color: 'legacy',
      radius: 'legacy',
      agent: 'legacy'
    } as unknown as WorkspaceTheme

    expect(resolveWorkspaceTheme(unknownTheme)).toEqual(DEFAULT_WORKSPACE_THEME)
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
        radius: 'subtle',
        agent: 'dorito'
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
