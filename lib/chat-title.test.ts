import { describe, expect, test } from 'bun:test'

import { formatChatTitle, sanitizeGeneratedChatTitle } from './chat-title'

describe('formatChatTitle', () => {
  test('uses the first meaningful sentence or line', () => {
    expect(formatChatTitle('\n\n## Fix the broken picker\nMore detail')).toBe(
      'Fix the broken picker'
    )
    expect(formatChatTitle('Can you fix the picker? It is broken.')).toBe('Can you fix the picker?')
  })

  test('collapses whitespace and removes surrounding Markdown', () => {
    expect(formatChatTitle('  **Build   a\tcustomer dashboard**  ')).toBe(
      'Build a customer dashboard'
    )
    expect(formatChatTitle('```\nBuild the customer dashboard\n```')).toBe(
      'Build the customer dashboard'
    )
    expect(formatChatTitle('[Build the dashboard](https://example.com)')).toBe(
      'Build the dashboard'
    )
  })

  test('truncates long titles at a word boundary', () => {
    const title = formatChatTitle(
      'Build a detailed customer operations dashboard with inventory alerts and regional revenue comparisons'
    )
    expect(title.length).toBeLessThanOrEqual(64)
    expect(title).toBe('Build a detailed customer operations dashboard with inventory')
  })

  test('keeps Unicode text and uses attachment filenames when text is empty', () => {
    expect(formatChatTitle('Сделай сводку по продажам')).toBe('Сделай сводку по продажам')
    expect(formatChatTitle('', ['sales.csv', 'notes.pdf'])).toBe('sales.csv, notes.pdf')
  })

  test('returns an empty title for empty input', () => {
    expect(formatChatTitle(' \n ')).toBe('')
  })
})

describe('sanitizeGeneratedChatTitle', () => {
  test('removes wrapping Markdown and trailing punctuation', () => {
    expect(sanitizeGeneratedChatTitle('**Fix picker focus.**')).toBe('Fix picker focus')
  })
})
