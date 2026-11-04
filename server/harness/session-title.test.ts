import { describe, expect, test } from 'bun:test'

import {
  buildSessionTitleSource,
  parseGeneratedSessionTitle,
  parseGeneratedSessionTitleJson
} from './session-title'

describe('buildSessionTitleSource', () => {
  test('uses visible text and attachment filenames without internal paths', () => {
    expect(buildSessionTitleSource('  Build\n a dashboard ', ['sales.csv', ' notes.pdf '])).toBe(
      'Build a dashboard Attachments: sales.csv, notes.pdf'
    )
  })

  test('uses filenames for an attachment-only session', () => {
    expect(buildSessionTitleSource('', ['sales.csv', 'notes.pdf'])).toBe('sales.csv, notes.pdf')
  })

  test('removes control and format characters from untrusted input', () => {
    expect(buildSessionTitleSource('Ignore\u0000 this\u202E request')).toBe('Ignore this request')
  })

  test('limits the source to 1,000 Unicode code points', () => {
    const source = buildSessionTitleSource('😀'.repeat(1_001))
    expect([...source]).toHaveLength(1_000)
    expect(source).toBe('😀'.repeat(1_000))
  })
})

describe('parseGeneratedSessionTitle', () => {
  test('normalizes and limits a structured title', () => {
    expect(parseGeneratedSessionTitle({ title: '  Build\n customer   dashboard  ' })).toBe(
      'Build customer dashboard'
    )
    expect(parseGeneratedSessionTitle({ title: '😀'.repeat(65) })).toBe('😀'.repeat(64))
  })

  test('rejects malformed structured output', () => {
    expect(parseGeneratedSessionTitle(null)).toBeNull()
    expect(parseGeneratedSessionTitle({})).toBeNull()
    expect(parseGeneratedSessionTitle({ title: ' \u0000 ' })).toBeNull()
    expect(parseGeneratedSessionTitle({ title: 42 })).toBeNull()
    expect(parseGeneratedSessionTitle({ title: 'Review auth flow', extra: true })).toBeNull()
  })

  test('parses only valid JSON objects', () => {
    expect(parseGeneratedSessionTitleJson('{"title":"Review auth flow"}')).toBe('Review auth flow')
    expect(parseGeneratedSessionTitleJson('Review auth flow')).toBeNull()
    expect(parseGeneratedSessionTitleJson('{"name":"Review auth flow"}')).toBeNull()
  })
})
