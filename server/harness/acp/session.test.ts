// Replay-path test for the ACP session layer: a mock ACP agent (a tiny
// newline-JSON-RPC script) answers `initialize` and replays a canned history
// as `session/update` notifications on `session/load`, exercising the REAL
// client transport + session record + adapter — everything except a live
// backend. This is the path a thread fetch takes after a server restart
// (sessionEvents → ensureAcpSessionLive → resumeSession).
import { afterAll, describe, expect, test } from 'bun:test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { appendMoiContext, renderMoiContext } from '@/lib/moi-context'

import { killAllAcpClients } from './client'
import { type AcpProviderConfig, ensureAcpSessionLive, forgetAllAcpSessions } from './session'

let seq = 0

// The agent script speaks the same wire dialect client.ts does: one JSON
// object per line on stdio. Replay updates ride in via MOCK_UPDATES so each
// test controls its own history.
const AGENT_SOURCE = `
const updates = JSON.parse(process.env.MOCK_UPDATES ?? '[]')
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
    if (msg.method === 'initialize') {
      send({ jsonrpc: '2.0', id: msg.id, result: { protocolVersion: 1, agentCapabilities: {} } })
    } else if (msg.method === 'session/load') {
      for (const update of updates) {
        send({
          jsonrpc: '2.0',
          method: 'session/update',
          params: { sessionId: msg.params.sessionId, update }
        })
      }
      send({ jsonrpc: '2.0', id: msg.id, result: {} })
    } else if (msg.id !== undefined) {
      send({ jsonrpc: '2.0', id: msg.id, result: {} })
    }
  }
})
`

async function replayThroughMockAgent(updates: unknown[]) {
  const dir = await mkdtemp(join(tmpdir(), 'acp-session-test-'))
  const agentPath = join(dir, 'mock-acp-agent.js')
  await Bun.write(agentPath, AGENT_SOURCE)
  const config: AcpProviderConfig = {
    id: 'hermes',
    provider: 'hermes',
    spawn: async () => ({
      provider: 'hermes',
      command: process.execPath,
      args: [agentPath],
      workspacePath: dir,
      env: { MOCK_UPDATES: JSON.stringify(updates) }
    })
  }
  // Session records key on (workspaceId, sessionId) in module state, so each
  // call gets fresh ids or the second test would reuse the first's record.
  seq++
  return ensureAcpSessionLive(config, {
    workspaceId: `ws-test-${seq}`,
    workspacePath: dir,
    sessionId: `sess-replay-${seq}`
  })
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

  test('an envelope-only user block replays as no turn at all', async () => {
    const envelope = renderMoiContext({ activeTab: 'agent' })
    const events = await replayThroughMockAgent([
      { sessionUpdate: 'user_message_chunk', content: { type: 'text', text: envelope } },
      { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'hi' } }
    ])

    const turns = events.flatMap(e => (e.kind === 'turn' ? [e.turn] : []))
    expect(turns.map(t => t.role)).toEqual(['assistant'])
  })
})
