import { expect, test } from 'bun:test'
import type { StreamEvent } from '@/lib/types'
import { inheritedHistoryBoundary } from './fork'

test('fork boundary follows transcript order when an older turn is updated last', () => {
  const turn = (id: string): StreamEvent => ({
    kind: 'turn',
    turn: {
      id,
      role: 'user',
      origin: { kind: 'user-input' },
      parts: [],
      timestamp: '2026-09-17T12:00:00Z'
    }
  })
  expect(
    inheritedHistoryBoundary([turn('first'), turn('last'), turn('first')]).forkedThroughMessageId
  ).toBe('last')
  expect(inheritedHistoryBoundary([]).forkedThroughMessageId).toBeUndefined()
})
