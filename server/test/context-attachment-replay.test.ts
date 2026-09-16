import { describe, expect, test } from 'bun:test'
import { appendContextAttachments, contextAttachmentParts } from '@/lib/moi-attachments'
import { appendMoiContext, renderMoiContext, moiContextSystemReminder } from '@/lib/moi-context'
import { ClaudeAdapter } from '../harness/claude-code/adapter'
import { codexItemToTurn } from '../harness/codex/adapter'
import { messageToTurn } from '../harness/openclaw/adapter'
import { replayedUserParts } from '../harness/acp/adapter'
import { buildUserMessage } from '../harness/claude-code/session'

const attachments = [{ source: 'view:orders', label: 'Order #1042', context: { orderId: '1042' } }]
const ambient = renderMoiContext({ activeTab: 'view:orders' })

describe('durable context attachments', () => {
  for (const text of ['Review this order', '', 'What does <moi-attachments> mean?']) {
    test(`replays the same display parts across all harnesses: ${text || 'context only'}`, () => {
      const raw = appendContextAttachments(text, attachments)
      const expected = [
        ...contextAttachmentParts(attachments),
        ...(text ? [{ type: 'text' as const, text }] : [])
      ]
      const cc = new ClaudeAdapter()
      cc.ingest({
        type: 'user',
        uuid: 'user',
        message: {
          role: 'user',
          content: [
            { type: 'text', text: moiContextSystemReminder(ambient) },
            { type: 'text', text: raw }
          ]
        }
      })
      const event = cc.hello().find(e => e.kind === 'turn')
      expect(event?.kind === 'turn' ? event.turn.parts : null).toEqual(expected)
      expect(event?.kind === 'turn' ? event.turn.origin : null).toEqual({ kind: 'user-input' })
      for (const content of [raw, appendMoiContext(raw, ambient)]) {
        expect(
          codexItemToTurn(
            { type: 'userMessage', id: 'user', content: [{ type: 'text', text: content }] },
            'session'
          )?.parts
        ).toEqual(expected)
        expect(messageToTurn({ role: 'user', content }, 'session', 0, new Map())?.parts).toEqual(
          expected
        )
        expect(replayedUserParts(content)).toEqual(expected)
      }
      const sent = buildUserMessage(text, [], attachments)
      expect(sent.parts).toEqual(expected)
      expect(sent.content).toBe(raw)
    })
  }
})
