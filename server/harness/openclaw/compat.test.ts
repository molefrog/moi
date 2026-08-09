// Wire-fixture tests for the protocol-v4 compat helpers. Every "real" fixture
// below is lifted from live captures against running gateways (2026.7.1 on the
// main rig, 2026.6.33 and 2026.4.22 side rigs); bulky irrelevant fields are
// trimmed but field placement is faithful to the wire.
import { describe, expect, test } from 'bun:test'

import {
  type GatewayInfo,
  classifyGatewayError,
  messageIdempotencyKey,
  parseHelloOk
} from './compat'

// hello-ok payload as the 2026.6.33 gateway sends it (probe capture). The live
// list has 133 methods and 26 events — trimmed to the ones moi cares about,
// same placement (`features.methods` / `features.events`, `server.version`).
const helloV633 = {
  type: 'hello-ok',
  protocol: 4,
  server: { version: '2026.6.33', connId: '9c2f6a1e-4b0d-4f4a-a1a2-7f3f0c2d9b11' },
  features: {
    methods: [
      'chat.history',
      'models.list',
      'sessions.abort',
      'sessions.create',
      'sessions.get',
      'sessions.list',
      'sessions.messages.subscribe',
      'sessions.patch',
      'sessions.resolve',
      'sessions.send',
      'sessions.subscribe'
    ],
    events: [
      'agent',
      'chat',
      'health',
      'presence',
      'session.message',
      'session.tool',
      'sessions.changed',
      'tick'
    ]
  },
  auth: { role: 'operator', scopes: ['operator.read', 'operator.write'] },
  policy: { maxPayload: 26214400, maxBufferedBytes: 52428800, tickIntervalMs: 15000 }
}

describe('parseHelloOk', () => {
  test('maps a real 2026.6.33 hello-ok onto GatewayInfo', () => {
    expect(parseHelloOk(helloV633)).toEqual({
      protocol: 4,
      serverVersion: '2026.6.33',
      methods: new Set(helloV633.features.methods),
      events: new Set(helloV633.features.events)
    })
  })

  test('degenerate inputs still produce a safe GatewayInfo', () => {
    const empty: GatewayInfo = {
      protocol: undefined,
      serverVersion: undefined,
      methods: new Set(),
      events: new Set()
    }
    expect(parseHelloOk(undefined)).toEqual(empty)
    expect(parseHelloOk({})).toEqual(empty)
    // Non-array features and a non-object server must not throw or leak junk.
    expect(
      parseHelloOk({
        protocol: 4,
        server: 'nope',
        features: { methods: 'sessions.send', events: { chat: true } }
      })
    ).toEqual({ protocol: 4, serverVersion: undefined, methods: new Set(), events: new Set() })
  })

  test('non-string entries are filtered out of methods/events', () => {
    const info = parseHelloOk({
      features: { methods: [1, 'sessions.send', null, 'models.list'], events: [false] }
    })
    expect(info.methods).toEqual(new Set(['sessions.send', 'models.list']))
    expect(info.events.size).toBe(0)
  })
})

describe('classifyGatewayError', () => {
  test('the real protocol-3 refusal string classifies as protocol-mismatch', () => {
    // Exact wording a live 2026.4.22 gateway rejects the handshake with
    // (INVALID_REQUEST "protocol mismatch", then WS close 1002).
    const failure = classifyGatewayError(new Error('protocol mismatch'))
    expect(failure.kind).toBe('protocol-mismatch')
    expect(failure.message).toContain('2026.6')
  })

  test('connect timeout and refused sockets classify as unreachable', () => {
    // Real strings: gateway.ts's own connect-timeout error and the Node
    // syscall error for a dead port.
    expect(classifyGatewayError(new Error('openclaw connect timeout after 5000ms')).kind).toBe(
      'unreachable'
    )
    expect(classifyGatewayError(new Error('connect ECONNREFUSED 127.0.0.1:18789')).kind).toBe(
      'unreachable'
    )
  })

  test('anything else falls through to unknown with the message preserved', () => {
    expect(classifyGatewayError('something inexplicable')).toEqual({
      kind: 'unknown',
      message: 'something inexplicable'
    })
  })
})

describe('messageIdempotencyKey', () => {
  test('2026.7.1 placement: nested under __openclaw (real user echo)', () => {
    // Durable user row from a live 2026.7.1 run (events-v2 capture) — this
    // line emits the key both nested and message-level.
    const user71 = {
      role: 'user',
      content: 'Reply with one short sentence about the moon.',
      timestamp: 1785860949853,
      idempotencyKey: '8644265a-4ee1-4f85-95bd-33731734ea49:user',
      __openclaw: {
        senderIsOwner: true,
        id: 'a31ce4f0',
        idempotencyKey: '8644265a-4ee1-4f85-95bd-33731734ea49:user',
        seq: 7
      }
    }
    expect(messageIdempotencyKey(user71)).toBe('8644265a-4ee1-4f85-95bd-33731734ea49:user')
    // Isolate the nested placement: it must win over the flat field.
    expect(
      messageIdempotencyKey({ idempotencyKey: 'flat', __openclaw: { idempotencyKey: 'nested' } })
    ).toBe('nested')
  })

  test('2026.6.33 placement: message-level only (real user echo)', () => {
    // Durable user row from a live 2026.6.33 run (events-v633 capture) — no
    // nested copy on this line.
    const user633 = {
      role: 'user',
      content: 'Use your exec tool to run: echo ping — then reply with one word.',
      timestamp: 1785862588312,
      idempotencyKey: '7dab6912-cc65-4292-9385-0826a7baa74b:user',
      __openclaw: { id: 'ecea2508', seq: 3 }
    }
    expect(messageIdempotencyKey(user633)).toBe('7dab6912-cc65-4292-9385-0826a7baa74b:user')
  })

  test('absent on assistant rows and empty input', () => {
    // Assistant rows never carry the key (real 2026.6.33 assistant row, trimmed).
    expect(
      messageIdempotencyKey({
        role: 'assistant',
        content: [{ type: 'text', text: 'pong' }],
        __openclaw: { id: '4cffd729', seq: 6 }
      })
    ).toBeUndefined()
    expect(messageIdempotencyKey(undefined)).toBeUndefined()
  })
})

// Thinking levels used to live here as one static list. They are per-model —
// see thinking.test.ts for the live-captured menus that disproved that.
