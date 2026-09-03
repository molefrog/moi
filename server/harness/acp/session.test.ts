// Tests for the ACP session layer against a mock ACP agent (a tiny
// newline-JSON-RPC script), exercising the REAL client transport + session
// record + adapter — everything except a live backend. Covers the replay path
// a thread fetch takes after a server restart (sessionEvents →
// ensureAcpSessionLive → resumeSession) and the model state a chat start and
// the picker share.
import { afterAll, describe, expect, test } from 'bun:test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { appendMoiContext, renderMoiContext } from '@/lib/moi-context'

import { killAllAcpClients } from './client'
import { listAcpModels } from './discovery'
import { clearAcpModelCache } from './model-state'
import { appendRunDuration, setRunDurationsPath } from './run-durations'
import {
  type AcpProviderConfig,
  ensureAcpSessionLive,
  forgetAllAcpSessions,
  sendAcpMessage
} from './session'

let seq = 0

// The agent script speaks the same wire dialect client.ts does: one JSON
// object per line on stdio. Each test scripts it through env: MOCK_UPDATES is
// the history replayed on `session/load`, MOCK_NEW_SESSIONS answers successive
// `session/new` calls (the last entry repeats), and every request is appended
// to MOCK_METHOD_LOG.
const AGENT_SOURCE = `
const { appendFileSync } = require('node:fs')
const updates = JSON.parse(process.env.MOCK_UPDATES ?? '[]')
const newSessions = JSON.parse(process.env.MOCK_NEW_SESSIONS ?? '[]')
let created = 0
const send = o => process.stdout.write(JSON.stringify(o) + '\\n')
let buf = ''
process.stdin.on('data', chunk => {
  buf += chunk
  let nl
  while ((nl = buf.indexOf('\\n')) >= 0) {
    const line = buf.slice(0, nl)
    buf = buf.slice(nl + 1)
    if (!line.trim()) continue
    const msg = JSON.parse(line)
    appendFileSync(process.env.MOCK_METHOD_LOG, JSON.stringify({ method: msg.method, params: msg.params }) + '\\n')
    if (msg.method === 'initialize') {
      send({ jsonrpc: '2.0', id: msg.id, result: { protocolVersion: 1, agentCapabilities: {} } })
    } else if (msg.method === 'session/new' && newSessions.length) {
      const next = newSessions[Math.min(created++, newSessions.length - 1)]
      send({ jsonrpc: '2.0', id: msg.id, result: { sessionId: process.env.MOCK_SESSION_ID, ...next } })
    } else if (msg.method === 'session/load') {
      for (const update of updates) {
        send({
          jsonrpc: '2.0',
          method: 'session/update',
          params: { sessionId: msg.params.sessionId, update }
        })
      }
      send({ jsonrpc: '2.0', id: msg.id, result: {} })
    } else if (msg.method === 'session/prompt') {
      send({ jsonrpc: '2.0', id: msg.id, result: { stopReason: 'end_turn' } })
    } else if (msg.id !== undefined) {
      send({ jsonrpc: '2.0', id: msg.id, result: {} })
    }
  }
})
`

type LoggedRpc = { method: string; params?: unknown }

type MockAgentOptions = {
  updates?: unknown[]
  newSessions?: unknown[]
  modelStateFingerprint?: AcpProviderConfig['modelStateFingerprint']
}

// One agent per test. Its temp dir doubles as the workspace path, and session
// records key on (workspaceId, sessionId) in module state, so every call gets
// fresh ids or the second test would reuse the first's record.
async function mockAgent(options: MockAgentOptions = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'acp-session-test-'))
  const agentPath = join(dir, 'mock-acp-agent.js')
  const methodLog = join(dir, 'methods.jsonl')
  await Bun.write(agentPath, AGENT_SOURCE)
  seq++
  const sessionId = `sess-test-${seq}`
  const config: AcpProviderConfig = {
    id: 'hermes',
    provider: 'hermes',
    ...(options.modelStateFingerprint
      ? { modelStateFingerprint: options.modelStateFingerprint }
      : {}),
    spawn: async () => ({
      provider: 'hermes',
      command: process.execPath,
      args: [agentPath],
      workspacePath: dir,
      env: {
        MOCK_METHOD_LOG: methodLog,
        MOCK_SESSION_ID: sessionId,
        MOCK_UPDATES: JSON.stringify(options.updates ?? []),
        MOCK_NEW_SESSIONS: JSON.stringify(options.newSessions ?? [])
      }
    })
  }
  return {
    dir,
    config,
    sessionId,
    ctx: { workspaceId: `ws-test-${seq}`, workspacePath: dir },
    // Every request the agent received, in order.
    calls: async (): Promise<LoggedRpc[]> =>
      (await Bun.file(methodLog).text())
        .trim()
        .split('\n')
        .map(line => JSON.parse(line) as LoggedRpc)
  }
}

async function replayThroughMockAgent(updates: unknown[], seedDurations: number[] = []) {
  const agent = await mockAgent({ updates })
  setRunDurationsPath(join(agent.dir, 'run-durations.json'))
  for (const ms of seedDurations) await appendRunDuration(agent.dir, agent.sessionId, ms)
  return ensureAcpSessionLive(agent.config, { ...agent.ctx, sessionId: agent.sessionId })
}

afterAll(() => {
  forgetAllAcpSessions()
  killAllAcpClients()
})

describe('ACP session replay', () => {
  test('a replayed history keeps its tool calls and strips the moi-context envelope', async () => {
    const envelope = renderMoiContext({ activeTab: 'agent' })
    const events = await replayThroughMockAgent([
      {
        sessionUpdate: 'user_message_chunk',
        content: { type: 'text', text: appendMoiContext('run the tests', envelope) }
      },
      { sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'planning' } },
      {
        // Replay-shaped tool call: Hermes hands out `functions.<tool>:<index>`
        // ids on replay, not the live `tc-<hash>` (NOTES.md §3.4).
        sessionUpdate: 'tool_call',
        toolCallId: 'functions.terminal:0',
        title: 'terminal: bun test',
        kind: 'execute',
        status: 'pending'
      },
      {
        sessionUpdate: 'tool_call_update',
        toolCallId: 'functions.terminal:0',
        status: 'completed',
        content: [{ type: 'content', content: { type: 'text', text: '12 pass' } }]
      },
      { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'All green.' } }
    ])

    const turns = events.flatMap(e => (e.kind === 'turn' ? [e.turn] : []))
    expect(turns.map(t => t.parts[0]?.type)).toEqual(['text', 'reasoning', 'tool-call', 'text'])

    const user = turns[0]
    expect(user.role).toBe('user')
    expect(user.parts).toEqual([{ type: 'text', text: 'run the tests' }])

    const tool = turns[2].parts[0]
    if (tool.type !== 'tool-call') throw new Error('expected a tool-call part')
    expect(tool.call).toMatchObject({
      name: 'terminal: bun test',
      state: 'success',
      output: '12 pass',
      provider: 'hermes'
    })

    // Replay carries no timestamps, and stamping turns with replay-time dates
    // would make the client report the replay's own duration ("Worked for
    // 1s"). Replayed turns must omit the timestamp entirely.
    expect(turns.every(t => t.timestamp === undefined)).toBe(true)
  })

  test('repeated replay tool-call ids stay separate turns', async () => {
    // Hermes replay ids are `functions.<tool>:<index>` with the index scoped
    // to one assistant message (NOTES.md §3.4), so a session that calls the
    // same tool from several messages replays the same id repeatedly. Each
    // pair must land as its own turn — upsert-by-id would collapse them all
    // into the first one.
    const pair = (output: string) => [
      {
        sessionUpdate: 'tool_call',
        toolCallId: 'functions.terminal:0',
        title: `terminal: echo ${output}`,
        kind: 'execute',
        status: 'pending'
      },
      {
        sessionUpdate: 'tool_call_update',
        toolCallId: 'functions.terminal:0',
        status: 'completed',
        content: [{ type: 'content', content: { type: 'text', text: output } }]
      }
    ]
    const events = await replayThroughMockAgent([
      { sessionUpdate: 'user_message_chunk', content: { type: 'text', text: 'first' } },
      ...pair('one'),
      { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'ran one' } },
      { sessionUpdate: 'user_message_chunk', content: { type: 'text', text: 'again' } },
      ...pair('two'),
      { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'ran two' } }
    ])

    const tools = events.flatMap(e =>
      e.kind === 'turn' && e.turn.parts[0]?.type === 'tool-call' ? [e.turn] : []
    )
    expect(tools).toHaveLength(2)
    expect(tools.map(t => t.parts[0].type === 'tool-call' && t.parts[0].call.output)).toEqual([
      'one',
      'two'
    ])
    // Each occurrence keeps its transcript position between its user message
    // and the agent's reply.
    const roles = events.flatMap(e =>
      e.kind === 'turn' ? [e.turn.parts[0]?.type === 'tool-call' ? 'tool' : e.turn.role] : []
    )
    expect(roles).toEqual(['user', 'tool', 'assistant', 'user', 'tool', 'assistant'])
  })

  test('re-attaches recorded run durations to each run-final turn', async () => {
    const events = await replayThroughMockAgent(
      [
        { sessionUpdate: 'user_message_chunk', content: { type: 'text', text: 'build it' } },
        {
          sessionUpdate: 'tool_call',
          toolCallId: 'functions.terminal:0',
          title: 'terminal: bun build',
          kind: 'execute',
          status: 'completed'
        },
        { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'built' } },
        { sessionUpdate: 'user_message_chunk', content: { type: 'text', text: 'thanks' } },
        { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'anytime' } }
      ],
      [5000, 250]
    )

    const turns = events.flatMap(e => (e.kind === 'turn' ? [e.turn] : []))
    expect(turns.map(t => t.meta?.durationMs)).toEqual([
      undefined, // user
      undefined, // tool call
      5000, // run 1 final turn
      undefined, // user
      250 // run 2 final turn
    ])
  })

  test('skips duration re-attach when the recording does not match the replay', async () => {
    const events = await replayThroughMockAgent(
      [
        { sessionUpdate: 'user_message_chunk', content: { type: 'text', text: 'one message' } },
        { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'one reply' } }
      ],
      // Two recorded runs against one replayed run — a wrong label is worse
      // than none, so nothing attaches.
      [5000, 250]
    )

    const turns = events.flatMap(e => (e.kind === 'turn' ? [e.turn] : []))
    expect(turns.every(t => t.meta?.durationMs === undefined)).toBe(true)
  })

  test('an envelope-only user block replays as no turn at all', async () => {
    const envelope = renderMoiContext({ activeTab: 'agent' })
    const events = await replayThroughMockAgent([
      { sessionUpdate: 'user_message_chunk', content: { type: 'text', text: envelope } },
      { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'hi' } }
    ])

    const turns = events.flatMap(e => (e.kind === 'turn' ? [e.turn] : []))
    expect(turns.map(t => t.role)).toEqual(['assistant'])
  })

  test('an image-only send keeps its user turn on replay', async () => {
    // An image-only send stores an image block plus an envelope-only text
    // block (sendAcpMessage unshifts the envelope when no text block exists).
    // Stripping the envelope must not drop the turn — the image survives as a
    // data-URL file part, the same cold-reload fallback other adapters use.
    const envelope = renderMoiContext({ activeTab: 'agent' })
    const events = await replayThroughMockAgent([
      { sessionUpdate: 'user_message_chunk', content: { type: 'text', text: envelope } },
      {
        sessionUpdate: 'user_message_chunk',
        content: { type: 'image', mimeType: 'image/png', data: 'aGVsbG8=' }
      },
      { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'a red circle' } }
    ])

    const turns = events.flatMap(e => (e.kind === 'turn' ? [e.turn] : []))
    expect(turns.map(t => t.role)).toEqual(['user', 'assistant'])
    expect(turns[0].parts).toEqual([
      { type: 'file', mediaType: 'image/png', url: 'data:image/png;base64,aGVsbG8=' }
    ])
  })
})

// A `session/new` result whose catalog names the session it came from, so a
// picker row's value tells which session (the chat's own, or a throwaway
// discovery) the cache was filled from.
const newSession = (...modelIds: string[]) => ({
  models: { availableModels: modelIds.map(modelId => ({ modelId })), currentModelId: modelIds[0] }
})

describe('ACP model state', () => {
  const sessions = [newSession('model-a'), newSession('model-b')]
  const catalog = async (agent: Awaited<ReturnType<typeof mockAgent>>) =>
    (await listAcpModels(agent.config, agent.ctx)).map(m => m.value)

  test('caches the catalog per workspace until cleared', async () => {
    const agent = await mockAgent({ newSessions: sessions })

    expect(await catalog(agent)).toEqual(['model-a'])
    expect(await catalog(agent)).toEqual(['model-a'])
    clearAcpModelCache(agent.dir)
    expect(await catalog(agent)).toEqual(['model-b'])
  })

  test('rediscovers only when the provider fingerprint changes', async () => {
    let stamp = 'v1'
    const agent = await mockAgent({
      newSessions: sessions,
      modelStateFingerprint: async () => stamp
    })

    expect(await catalog(agent)).toEqual(['model-a'])
    stamp = 'v2'
    expect(await catalog(agent)).toEqual(['model-b'])
    expect(await catalog(agent)).toEqual(['model-b'])
  })

  test('a chat start seeds the cache, so the picker opens no session of its own', async () => {
    const agent = await mockAgent({ newSessions: sessions })

    await sendAcpMessage(agent.config, {
      ...agent.ctx,
      sessionId: agent.sessionId,
      isNew: true,
      content: 'first'
    })

    expect(await catalog(agent)).toEqual(['model-a'])
  })

  test('runs on the agent default until moi switches before the next prompt', async () => {
    const agent = await mockAgent({ newSessions: [newSession('model-a', 'model-b')] })
    const send = (content: string, model?: string) =>
      sendAcpMessage(agent.config, {
        ...agent.ctx,
        sessionId: agent.sessionId,
        isNew: content === 'first',
        content,
        ...(model ? { model } : {})
      })

    await send('first')
    await send('second', 'model-b')

    const calls = await agent.calls()
    expect(calls.map(c => c.method)).toEqual([
      'initialize',
      'session/new',
      'session/prompt',
      'session/set_model',
      'session/prompt'
    ])
    expect(calls[3].params).toEqual({ sessionId: agent.sessionId, modelId: 'model-b' })
  })
})
