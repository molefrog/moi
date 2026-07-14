// Tests for turning the live preview into a synthetic turn, and — the crux of
// the grouping fix — that a thinking-only preview turn MERGES into the current
// tool group via groupTurns (instead of rendering as a detached block), while a
// preview with text stands alone, exactly matching finalized behavior.
import { describe, expect, test } from 'bun:test'

import { groupTurns } from '@/client/features/chat/group-turns'
import {
  LIVE_PREVIEW_TURN_ID,
  buildPreviewTurn,
  previewBlocksToParts
} from '@/client/features/chat/preview-turn'
import { type LivePreview, selectPreviews } from '@/client/features/chat/chat-store'
import type { Part, PreviewBlock, Turn, ToolCall } from '@/lib/types'

const WS = 'ws1'
const SID = 'sess-1'

const previewOf = (blocks: PreviewBlock[], parentToolUseId: string | null = null): LivePreview => ({
  workspaceId: WS,
  sessionId: SID,
  parentToolUseId,
  blocks,
  updatedAt: 1
})

const toolPart = (id: string, name: string): Part => {
  const call: ToolCall = { toolCallId: id, name, caller: 'model', state: 'success', input: {} }
  return { type: 'tool-call', call }
}
const assistantTurn = (id: string, parts: Part[]): Turn => ({
  id,
  role: 'assistant',
  origin: { kind: 'user-input' },
  parts
})

describe('previewBlocksToParts', () => {
  test('drops empty blocks and maps kinds, preserving order', () => {
    expect(
      previewBlocksToParts([
        { index: 0, kind: 'reasoning', text: 'think' },
        { index: 1, kind: 'text', text: '' },
        { index: 2, kind: 'text', text: 'answer' }
      ])
    ).toEqual([
      { type: 'reasoning', text: 'think' },
      { type: 'text', text: 'answer' }
    ])
  })
})

describe('buildPreviewTurn', () => {
  test('nothing visible → null', () => {
    expect(buildPreviewTurn(null)).toBe(null)
    expect(buildPreviewTurn(previewOf([{ index: 0, kind: 'text', text: '' }]))).toBe(null)
  })

  test('builds a stable-id assistant turn from visible blocks', () => {
    const turn = buildPreviewTurn(previewOf([{ index: 0, kind: 'reasoning', text: 'hmm' }]))
    expect(turn).toEqual({
      id: LIVE_PREVIEW_TURN_ID,
      role: 'assistant',
      origin: { kind: 'user-input' },
      parts: [{ type: 'reasoning', text: 'hmm' }]
    })
  })
})

describe('grouping: preview merges into the current tool group', () => {
  // Mirrors the screenshot: an assistant turn with text + tool calls, then a new
  // message that begins with thinking (streaming).
  const toolTurn = assistantTurn('t1', [
    { type: 'text', text: 'Let me read the docs.' },
    toolPart('r1', 'Read'),
    toolPart('r2', 'Read'),
    toolPart('b1', 'Bash')
  ])

  test('a thinking-only preview folds into the previous group (same id, one group)', () => {
    const preview = buildPreviewTurn(
      previewOf([{ index: 0, kind: 'reasoning', text: 'planning…' }])
    )!
    const grouped = groupTurns([toolTurn, preview])
    // Merged: still one grouped turn, keeping the tool turn's id (stable key).
    expect(grouped).toHaveLength(1)
    expect(grouped[0].id).toBe('t1')
    // The reasoning is appended after the tool calls (folds into the same run).
    expect(grouped[0].parts.map(p => p.type)).toEqual([
      'text',
      'tool-call',
      'tool-call',
      'tool-call',
      'reasoning'
    ])
  })

  test('a preview WITH text stands alone as its own group', () => {
    const preview = buildPreviewTurn(
      previewOf([{ index: 0, kind: 'text', text: 'The answer is…' }])
    )!
    const grouped = groupTurns([toolTurn, preview])
    expect(grouped).toHaveLength(2)
    expect(grouped[1].id).toBe(LIVE_PREVIEW_TURN_ID)
  })

  test('first preview after a user turn does not merge into the user turn', () => {
    const userTurn: Turn = {
      id: 'u1',
      role: 'user',
      origin: { kind: 'user-input' },
      parts: [{ type: 'text', text: 'hi' }]
    }
    const preview = buildPreviewTurn(
      previewOf([{ index: 0, kind: 'reasoning', text: 'thinking' }])
    )!
    const grouped = groupTurns([userTurn, preview])
    expect(grouped).toHaveLength(2)
    expect(grouped[1].id).toBe(LIVE_PREVIEW_TURN_ID)
  })
})

describe('selectPreviews', () => {
  const entry = (
    messageId: string,
    parentToolUseId: string | null,
    sessionId: string,
    updatedAt = 1
  ): [string, LivePreview] => [
    messageId,
    { workspaceId: WS, sessionId, parentToolUseId, blocks: [], updatedAt }
  ]

  test('splits root from per-subagent streams', () => {
    const previews = Object.fromEntries([entry('root', null, SID), entry('sub', 'toolu_1', SID)])
    const { root, byParent } = selectPreviews(previews, WS, SID)
    expect(root?.parentToolUseId).toBe(null)
    expect(byParent['toolu_1']?.parentToolUseId).toBe('toolu_1')
  })

  test('ignores other sessions and keeps the freshest root', () => {
    const previews = Object.fromEntries([
      entry('mine_old', null, SID, 1),
      entry('mine_new', null, SID, 2),
      entry('other', null, 'sess-2', 9)
    ])
    expect(selectPreviews(previews, WS, SID).root).toBe(previews['mine_new'])
  })

  test('null session → empties', () => {
    const previews = Object.fromEntries([entry('m', null, SID)])
    expect(selectPreviews(previews, WS, null)).toEqual({ root: null, byParent: {} })
  })
})
