import { expect, test } from 'bun:test'

import { applyEvent, applyEvents, emptyViewState } from './format'
import type { StreamEvent, Turn } from './format'

function turn(id: string, seq?: number, text = id): StreamEvent {
  return {
    kind: 'turn',
    turn: {
      id,
      seq,
      role: 'assistant',
      origin: { kind: 'user-input' },
      parts: [{ type: 'text', text }]
    }
  }
}

function expectSameReplay(events: StreamEvent[]) {
  const original = structuredClone(events)
  expect(applyEvents(events)).toEqual(events.reduce(applyEvent, emptyViewState()))
  expect(events).toEqual(original)
}

test('batch replay preserves upserts, mixed ordering, notices, snapshots and results', () => {
  expectSameReplay([
    turn('unsequenced'),
    turn('later', 20),
    turn('earlier', 10),
    turn('middle', 15),
    turn('earlier', 30, 'updated in place'),
    turn('inserted', 25),
    turn('tail'),
    turn('later', undefined, 'removed seq'),
    turn('negative', -1),
    { kind: 'notice', notice: { id: 'n1', kind: 'compact', at: 'first' } },
    { kind: 'notice', notice: { id: 'n2', kind: 'rate-limit', at: 'second' } },
    { kind: 'notice', notice: { id: 'n1', kind: 'compact', at: 'updated' } },
    { kind: 'result', result: { subtype: 'success', turns: 1 } },
    {
      kind: 'snapshot',
      snapshot: {
        sessionId: 'session',
        tools: [],
        mcpServers: [],
        plugins: [],
        skills: [],
        slashCommands: [],
        agents: [],
        updatedAt: 'first'
      }
    },
    { kind: 'result', result: { subtype: 'error_during_execution', turns: 2 } }
  ])
})

test('batch replay matches incremental replay across reordered and updated turns', () => {
  // Deterministic generated histories include seq changes on existing ids,
  // which must not reposition those turns or invalidate later insertions.
  let seed = 12345
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed
  }
  for (let run = 0; run < 20; run++) {
    const events: StreamEvent[] = Array.from({ length: 200 }, (_, i) =>
      turn(`t${random() % 50}`, random() % 3 === 0 ? undefined : random() % 100, `update ${i}`)
    )
    expectSameReplay(events)
  }
})

test('batch replay handles long ordered histories and returns independent arrays', () => {
  const events = Array.from({ length: 20_000 }, (_, i) => turn(`t${i}`, i))
  const view = applyEvents(events)
  expect(view.turns).toHaveLength(events.length)
  expect(view.turns.map(t => t.seq)).toEqual(Array.from({ length: events.length }, (_, i) => i))
  const replacement: Turn = {
    ...view.turns[0],
    parts: [{ type: 'text', text: 'replacement' }]
  }
  const next = applyEvent(view, { kind: 'turn', turn: replacement })
  expect(next.turns[0]).toBe(replacement)
  expect(view.turns[0].parts).toEqual([{ type: 'text', text: 't0' }])
  expect(applyEvents([])).toEqual(emptyViewState())
})
