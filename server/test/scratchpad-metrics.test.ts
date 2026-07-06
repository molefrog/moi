import { describe, expect, test } from 'bun:test'

import {
  LABEL_FONT_SIZES,
  LABEL_PADDING,
  fitRectToLabel,
  fontAvailable,
  measureLine,
  textBlockSize,
  wrapText
} from '../scratchpad-metrics'

// Text measurement must use the real canvas font (Shantell Sans from
// @tldraw/assets) — the heuristic fallback exists only for broken installs.

describe('scratchpad-metrics', () => {
  test('loads the actual tldraw draw font', () => {
    expect(fontAvailable()).toBe(true)
  })

  test('measures a known string close to its browser-rendered width', () => {
    // "Browser (internet)" at 24px measures ~233px in Shantell Sans Informal
    // Regular; the safety factor pushes it a touch above. A drifting font file
    // or broken shaping would land far outside this window.
    const w = measureLine('Browser (internet)', 24)
    expect(w).toBeGreaterThan(220)
    expect(w).toBeLessThan(260)
  })

  test('width scales linearly with font size and text length', () => {
    const short = measureLine('ab', 24)
    const long = measureLine('abab', 24)
    expect(long).toBeGreaterThan(short * 1.8)
    expect(measureLine('hello world', 48)).toBeCloseTo(measureLine('hello world', 24) * 2, 3)
    expect(measureLine('', 24)).toBe(0)
  })

  test('wrapText keeps every line within the max width', () => {
    const text = 'reverse proxy holds the TLS certificate for app.yourdomain.com'
    const lines = wrapText(text, 22, 200)
    expect(lines.length).toBeGreaterThan(1)
    for (const line of lines) {
      expect(measureLine(line, 22)).toBeLessThanOrEqual(200)
    }
    // Nothing lost in the wrap (long words may be hard-broken, so compare
    // with whitespace removed).
    expect(lines.join('').replaceAll(/\s+/g, '')).toBe(text.replaceAll(/\s+/g, ''))
  })

  test('wrapText hard-breaks a word wider than the line', () => {
    const lines = wrapText('https://app.yourdomain.com/very/long/path', 22, 120)
    expect(lines.length).toBeGreaterThan(1)
    for (const line of lines) {
      expect(measureLine(line, 22)).toBeLessThanOrEqual(120)
    }
  })

  test('wrapText honors explicit newlines', () => {
    expect(wrapText('one\ntwo', 22, 500)).toEqual(['one', 'two'])
  })

  test('textBlockSize reports wrapped dimensions', () => {
    const block = textBlockSize('a somewhat longer label that needs wrapping', 22, 180)
    expect(block.lines.length).toBeGreaterThan(1)
    expect(block.w).toBeLessThanOrEqual(180)
    expect(block.h).toBeCloseTo(block.lines.length * 22 * 1.35, 3)
  })

  test('fitRectToLabel returns a rect the wrapped label actually fits in', () => {
    const label =
      'reverse proxy: VPS+Caddy or Cloudflare — holds the TLS cert for app.yourdomain.com'
    const { w, h } = fitRectToLabel(label, { size: 'm' })
    // Re-wrap at the inner width the rect provides; it must fit with padding.
    const inner = textBlockSize(label, LABEL_FONT_SIZES.m, w - LABEL_PADDING * 2)
    expect(inner.w + LABEL_PADDING * 2).toBeLessThanOrEqual(w)
    expect(inner.h + LABEL_PADDING * 2).toBeLessThanOrEqual(h)
    // Multiples of the default grid.
    expect(w % 8).toBe(0)
    expect(h % 8).toBe(0)
  })

  test('fitRectToLabel respects minimums for tiny labels', () => {
    const { w, h } = fitRectToLabel('ok', { minW: 96, minH: 56 })
    expect(w).toBeGreaterThanOrEqual(96)
    expect(h).toBeGreaterThanOrEqual(56)
  })
})
