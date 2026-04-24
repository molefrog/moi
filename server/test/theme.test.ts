import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'path'

import type { WorkspaceLayout } from '@/lib/types'

import { loadLayout, saveLayout } from '../layout'
import { applyThemeUpdate, matchColorTheme } from '../theme'

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
    expect(result.applied).toEqual({ color: 'paper' })
  })

  test("'default' color clears overrides (undefined bg/fg drop via JSON.stringify)", () => {
    const current = { font: 'serif' as const, background: '#faf8f5', foreground: '#2c2825' }
    const result = applyThemeUpdate(current, { color: 'default' })
    if (!result.ok) throw new Error('expected ok')
    expect(result.theme.background).toBeUndefined()
    expect(result.theme.foreground).toBeUndefined()
    expect(result.theme.font).toBe('serif')

    // Round-trip: undefined values should not survive JSON serialization
    const roundTripped = JSON.parse(JSON.stringify(result.theme))
    expect('background' in roundTripped).toBe(false)
    expect('foreground' in roundTripped).toBe(false)
  })

  test('combined font + color updates apply both', () => {
    const result = applyThemeUpdate(undefined, { font: 'serif', color: 'mint' })
    if (!result.ok) throw new Error('expected ok')
    expect(result.theme.font).toBe('serif')
    expect(result.theme.background).toBe('#f0faf6')
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
      chatMode: 'sidebar',
      theme: { font: 'serif', background: '#faf8f5', foreground: '#2c2825' }
    }
    await saveLayout(layout, tmpDir)
    const loaded = await loadLayout(tmpDir)
    expect(loaded.theme).toEqual(layout.theme)
  })

  test('theme without overrides persists as minimal shape', async () => {
    const layout: WorkspaceLayout = {
      version: 1,
      widgetGrid: [],
      chatMode: 'sidebar',
      theme: { font: 'default' }
    }
    await saveLayout(layout, tmpDir)
    const loaded = await loadLayout(tmpDir)
    expect(loaded.theme).toEqual({ font: 'default' })
    expect('background' in (loaded.theme ?? {})).toBe(false)
  })
})
