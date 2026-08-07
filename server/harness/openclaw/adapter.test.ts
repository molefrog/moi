import { describe, expect, test } from 'bun:test'

import type { OpenClawMessage } from './discovery'
import { flattenToolResultContent, toSessionInfo, toStreamEvents } from './adapter'

describe('toSessionInfo', () => {
  test('prefers a stable label over display name and changing preview text', () => {
    expect(
      toSessionInfo(
        {
          key: 'agent:main:one',
          sessionId: 'one',
          updatedAt: 1,
          label: 'Customer dashboard',
          displayName: 'Derived title',
          lastMessagePreview: 'The latest reply'
        },
        '/workspace'
      ).summary
    ).toBe('Customer dashboard')
  })

  test('uses display name before derived title and latest-message preview', () => {
    expect(
      toSessionInfo(
        {
          key: 'agent:main:one',
          sessionId: 'one',
          updatedAt: 1,
          displayName: 'Stable display name',
          derivedTitle: 'Derived title',
          lastMessagePreview: 'The latest reply'
        },
        '/workspace'
      ).summary
    ).toBe('Stable display name')
  })

  test('uses a derived title before the latest-message preview', () => {
    expect(
      toSessionInfo(
        {
          key: 'agent:main:one',
          sessionId: 'one',
          updatedAt: 1,
          derivedTitle: 'First message title',
          lastMessagePreview: 'The latest reply'
        },
        '/workspace'
      ).summary
    ).toBe('First message title')
  })

  test('uses a normalized preview when no title exists', () => {
    expect(
      toSessionInfo(
        {
          key: 'agent:main:one',
          sessionId: 'one',
          updatedAt: 1,
          lastMessagePreview: '**Build   a dashboard**'
        },
        '/workspace'
      ).summary
    ).toBe('**Build a dashboard**')
  })

  test('suppresses the webchat origin — that is moi itself', () => {
    const info = toSessionInfo(
      {
        key: 'agent:main:main',
        sessionId: 'one',
        updatedAt: 1,
        origin: { provider: 'webchat', surface: 'webchat', chatType: 'direct' }
      },
      '/workspace'
    )
    expect(info.origin).toBeUndefined()
    expect(info.flavor).toBeUndefined()
  })

  test('surfaces an external channel origin with its label', () => {
    const info = toSessionInfo(
      {
        key: 'agent:main:irc-lounge',
        sessionId: 'one',
        updatedAt: 1,
        origin: {
          provider: 'irc',
          surface: 'irc',
          label: 'mole!mole@127.0.0.1',
          from: 'irc:mole!mole@127.0.0.1',
          to: 'irc:mole'
        }
      },
      '/workspace'
    )
    expect(info.origin).toEqual({ provider: 'irc', label: 'mole!mole@127.0.0.1' })
  })

  test('flags cron bucket sessions by key', () => {
    const info = toSessionInfo(
      {
        key: 'agent:main:cron:5599083d-8bb6-48c0-a74b-b1176f31866e',
        sessionId: 'one',
        updatedAt: 1,
        label: 'Cron: moi-cron-probe'
      },
      '/workspace'
    )
    expect(info.flavor).toBe('cron')
    expect(info.origin).toBeUndefined()
  })

  test('flags spawned subagent sessions via spawnedBy and key', () => {
    expect(
      toSessionInfo(
        {
          key: 'agent:main:subagent:93a70592-b29a-4b6b-baba-d48ae67dbccd',
          sessionId: 'one',
          updatedAt: 1,
          spawnedBy: 'agent:main:main'
        },
        '/workspace'
      ).flavor
    ).toBe('subagent')
    expect(
      toSessionInfo(
        { key: 'agent:main:subagent:without-spawned-by', sessionId: 'two', updatedAt: 1 },
        '/workspace'
      ).flavor
    ).toBe('subagent')
  })
})

describe('toStreamEvents model-change notices', () => {
  const assistant = (id: string, model: string, text: string, ts: number): OpenClawMessage =>
    ({
      role: 'assistant',
      content: [{ type: 'text', text }],
      model,
      provider: 'anthropic',
      timestamp: ts,
      __openclaw: { id, seq: 1 }
      // Widened: `model` lives outside the OpenClawMessage subset, as on the wire.
    }) as OpenClawMessage

  const user = (id: string, text: string): OpenClawMessage => ({
    role: 'user',
    content: [{ type: 'text', text }],
    __openclaw: { id, seq: 0 }
  })

  test('interleaves a notice when consecutive assistant rows switch model', () => {
    const events = toStreamEvents(
      {
        messages: [
          user('u1', 'hi'),
          assistant('a1', 'claude-sonnet-4-6', 'hello', 1785861350033),
          user('u2', 'switch'),
          assistant('a2', 'claude-opus-5', 'switched', 1785861360033)
        ]
      },
      'agent:main:main'
    )
    expect(events.map(e => e.kind)).toEqual(['turn', 'turn', 'turn', 'notice', 'turn'])
    const notice = events.find(e => e.kind === 'notice')?.notice
    expect(notice).toMatchObject({
      id: 'openclaw:model-change:a2',
      kind: 'model-change',
      model: 'claude-opus-5',
      prev: 'claude-sonnet-4-6',
      at: new Date(1785861360033).toISOString()
    })
  })

  test('emits no notice when the model never changes', () => {
    const events = toStreamEvents(
      {
        messages: [
          assistant('a1', 'claude-sonnet-4-6', 'one', 1),
          assistant('a2', 'claude-sonnet-4-6', 'two', 2)
        ]
      },
      'agent:main:main'
    )
    expect(events.every(e => e.kind === 'turn')).toBe(true)
  })

  test('notice ids stay stable across rebuilds of the same transcript', () => {
    const detail = {
      messages: [
        assistant('a1', 'claude-sonnet-4-6', 'one', 1),
        assistant('a2', 'claude-opus-5', 'two', 2)
      ]
    }
    const first = toStreamEvents(detail, 'agent:main:main')
    const second = toStreamEvents(detail, 'agent:main:main')
    const id = (events: typeof first) => events.find(e => e.kind === 'notice')?.notice.id
    expect(id(first)).toBe('openclaw:model-change:a2')
    expect(id(second)).toBe('openclaw:model-change:a2')
  })
})

describe('toSessionInfo — moi-context stripping (issue: envelope in title)', () => {
  const envelope =
    'Sup fool\n\n<moi-context>\nYou are running in a `moi` workspace — a shared UI.\n# Active tab\nThe user is on the "Agent" tab.\n</moi-context>'

  test('strips the moi-context envelope from a derived title', () => {
    // The gateway derives titles from the sent message, which carries the
    // appended envelope (sessions.send has no system channel).
    expect(
      toSessionInfo(
        { key: 'agent:main:main', sessionId: 'm', updatedAt: 1, derivedTitle: envelope },
        '/ws'
      ).summary
    ).toBe('Sup fool')
  })

  test('strips a truncated envelope from a display name', () => {
    expect(
      toSessionInfo(
        {
          key: 'agent:main:main',
          sessionId: 'm',
          updatedAt: 1,
          displayName: 'Sup fool <moi-context> You are runni…'
        },
        '/ws'
      ).summary
    ).toBe('Sup fool')
  })

  test('leaves a channel display name untouched', () => {
    expect(
      toSessionInfo(
        {
          key: 'agent:main:main',
          sessionId: 'm',
          updatedAt: 1,
          displayName: 'mole!mole@127.0.0.1'
        },
        '/ws'
      ).summary
    ).toBe('mole!mole@127.0.0.1')
  })
})

describe('flattenToolResultContent — cross-version tool result shapes', () => {
  test('flat text blocks (2026.7.1)', () => {
    expect(flattenToolResultContent([{ type: 'text', text: 'hello from bash' }])).toBe(
      'hello from bash'
    )
  })

  test('unwraps a nested toolResult block instead of showing [toolResult]', () => {
    // 2026.7.2+ can wrap the result in a toolResult-typed block; before the
    // recursion fix this rendered as a bare "[toolResult]" placeholder.
    expect(
      flattenToolResultContent([
        { type: 'toolResult', content: [{ type: 'text', text: 'ok done' }] } as never
      ])
    ).toBe('ok done')
  })

  test('reads text off a wrapper block that carries it directly', () => {
    expect(flattenToolResultContent([{ type: 'toolResult', text: 'inline' } as never])).toBe(
      'inline'
    )
  })

  test('image blocks and truly opaque blocks keep a placeholder', () => {
    expect(
      flattenToolResultContent([{ type: 'image', data: 'x', mimeType: 'image/png' } as never])
    ).toBe('[image]')
    expect(flattenToolResultContent([{ type: 'mystery' } as never])).toBe('[mystery]')
  })
})
