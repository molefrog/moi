import { describe, expect, test } from 'bun:test'

import { formatChatTitle } from './chat-title'
import { appendAttachments } from './moi-attachments'

describe('formatChatTitle', () => {
  test('collapses whitespace without interpreting the message', () => {
    expect(formatChatTitle('  **Build   a\tcustomer\ndashboard**  ')).toBe(
      '**Build a customer dashboard**'
    )
  })

  test('truncates long titles to 64 characters', () => {
    const title = formatChatTitle(
      'Build a detailed customer operations dashboard with inventory alerts and regional revenue comparisons'
    )
    expect(title).toHaveLength(64)
    expect(title).toBe('Build a detailed customer operations dashboard with inventory al')
  })

  test('keeps Unicode text and uses attachment filenames when text is empty', () => {
    expect(formatChatTitle('Сделай сводку по продажам')).toBe('Сделай сводку по продажам')
    expect(formatChatTitle('', ['sales.csv', 'notes.pdf'])).toBe('sales.csv, notes.pdf')
  })

  test('uses labels from an attachment-only message', () => {
    const text = appendAttachments('', [
      { type: 'image', label: 'Sketch.png', mediaType: 'image/png' },
      { type: 'file', mediaType: 'application/pdf', path: '/tmp/spec.pdf' }
    ])
    expect(formatChatTitle(text)).toBe('Sketch.png, spec.pdf')
  })

  test('returns an empty title for empty input', () => {
    expect(formatChatTitle(' \n ')).toBe('')
  })
})
