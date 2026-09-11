import { afterAll, afterEach, describe, expect, spyOn, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { ServerMessage, StreamEvent, Turn } from '@/lib/types'

import { agentStore } from '../../agent'
import { getClientFrameLog } from '../debug'
import { isFxOperationalMessage } from '../fx/adapter'
import { fxModels } from '../fx/models'
import { getAcpClient, killAcpWorkspace, killAllAcpClients } from './client'
import { listAcpModels } from './discovery'
import { setRunDurationsPath } from './run-durations'
import {
  type AcpProviderConfig,
  ensureAcpSessionLive,
  forgetAcpSession,
  forgetAllAcpSessions,
  getAcpActiveSessions,
  getLiveAcpEvents,
  interruptAcpRun,
  sendAcpMessage
} from './session'

// A single-session process, like fx. Discovery or a second chat on the same
// connection invalidates its predecessor. Slow load/prompt responses expose
// races that immediate fixture responses would conceal.
const SOURCE = `
const { appendFileSync, existsSync, readFileSync, writeFileSync } = require('node:fs')
const send = value => process.stdout.write(JSON.stringify(value) + '\\n')
let active, prompt, model = 'model-a', timer
if(process.env.MODEL_FILE && existsSync(process.env.MODEL_FILE)) model=readFileSync(process.env.MODEL_FILE,'utf8')
const state = () => ({ models: { currentModelId: model, availableModels: [{modelId:'model-a'}, {modelId:'model-b'}] } })
const update = value => send({jsonrpc:'2.0',method:'session/update',params:{sessionId:active,update:value}})
let buffer = ''
process.stdin.on('data', chunk => {
  buffer += chunk
  let nl
  while ((nl = buffer.indexOf('\\n')) >= 0) {
    const msg = JSON.parse(buffer.slice(0,nl)); buffer = buffer.slice(nl+1)
    appendFileSync(process.env.LOG, JSON.stringify({method:msg.method, params:msg.params, pid:process.pid})+'\\n')
    const result = value => send({jsonrpc:'2.0', id:msg.id,result:value})
    const error = message => send({jsonrpc:'2.0',id:msg.id,error:{code:-32000,message}})
    if(msg.method==='initialize') result({protocolVersion:1,agentCapabilities:{loadSession:true}})
    else if(msg.method==='session/new') {
      active='new-'+process.pid
      setTimeout(()=>result({sessionId:active,...state()}),Number(process.env.NEW_DELAY || 0))
    }
    else if(msg.method==='session/load') {
      active=msg.params.sessionId
      if(process.env.LOADED_MODEL) model=process.env.LOADED_MODEL
      if(process.env.REPLAY_UPDATES) {
        for(const event of JSON.parse(process.env.REPLAY_UPDATES)) update(event)
        result(state());continue
      }
      update({sessionUpdate:'user_message_chunk',messageId:'u1',content:{type:'text',text:'earlier'}})
      setTimeout(()=>{
        update({sessionUpdate:'agent_message_chunk',messageId:'a1',content:{type:'text',text:'history'}})
        result(state())
      },80)
    } else if(msg.method==='session/set_mode') {
      if(process.env.MODE_DELAY) setTimeout(()=>result({}),Number(process.env.MODE_DELAY))
      else result({})
    }
    else if(msg.method==='session/set_model') {
      if(msg.params.modelId==='bad') error('Model unavailable')
      else {
        model=msg.params.modelId
        if(process.env.MODEL_FILE) writeFileSync(process.env.MODEL_FILE,model)
        result({})
      }
    } else if(msg.method==='session/cancel') {
      if(prompt) {
        clearTimeout(timer)
        const stopped=prompt;prompt=undefined
        setTimeout(()=>send({jsonrpc:'2.0',id:stopped.id,result:{stopReason:'cancelled'}}),Number(process.env.CANCEL_DELAY || 0))
      }
    } else if(msg.method==='session/prompt') {
      if(msg.params.sessionId!==active) {error('Session was displaced');continue}
      prompt=msg
      const text=msg.params.prompt.find(p=>p.type==='text')?.text || ''
      if(text==='crash') {setTimeout(()=>process.exit(1),60);continue}
      if(process.env.PROMPT_UPDATES) {
        for(const event of JSON.parse(process.env.PROMPT_UPDATES)) update(event)
        timer=setTimeout(()=>{
          if(text!=='unfinished') update({sessionUpdate:'agent_message_chunk',messageId:'reply-'+msg.id,content:{type:'text',text:model+':'+text}})
          result({stopReason:'end_turn',usage:{inputTokens:2,outputTokens:3,totalTokens:5}});prompt=undefined
        },100)
        continue
      }
      if(process.env.DIAGNOSTIC_CHUNKS) {
        for(const text of JSON.parse(process.env.DIAGNOSTIC_CHUNKS)) {
          update({sessionUpdate:'agent_message_chunk',messageId:'diagnostic-'+msg.id,content:{type:'text',text}})
        }
      }
      update({sessionUpdate:'tool_call',toolCallId:'tool-'+msg.id,title:'Running',kind:'execute',status:'in_progress'})
      timer=setTimeout(()=>{
        if(text!=='unfinished') update({sessionUpdate:'tool_call_update',toolCallId:'tool-'+msg.id,status:'completed',content:[{type:'content',content:{type:'text',text:'tool result'}}]})
        if(text!=='tool-only' && text!=='unfinished') update({sessionUpdate:'agent_message_chunk',messageId:'reply-'+msg.id,content:{type:'text',text:model+':'+text}})
        result({stopReason:'end_turn',usage:{inputTokens:2,outputTokens:3,totalTokens:5}});prompt=undefined
      },100)
    } else if(msg.id!==undefined) result({})
  }
})
`

type Call = { method: string; params: Record<string, unknown>; pid: number }
const dirs: string[] = []
type FixtureOptions = {
  newDelay?: number
  modeDelay?: number
  cancelDelay?: number
  persistModel?: boolean
  loadedModel?: string
  replayUpdates?: Record<string, unknown>[]
  promptUpdates?: Record<string, unknown>[]
  diagnosticChunks?: string[]
}
async function fixture(options: FixtureOptions = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'moi-acp-lifecycle-'))
  dirs.push(dir)
  const log = join(dir, 'calls.jsonl')
  setRunDurationsPath(join(dir, 'durations.json'))
  const config: AcpProviderConfig = {
    id: 'fx',
    provider: 'fx',
    processScope: 'session',
    noPromptModeId: 'code',
    spawn: async () => ({
      provider: 'fx',
      command: process.execPath,
      args: ['-e', SOURCE],
      workspacePath: dir,
      env: {
        LOG: log,
        ...(options.newDelay ? { NEW_DELAY: String(options.newDelay) } : {}),
        ...(options.modeDelay ? { MODE_DELAY: String(options.modeDelay) } : {}),
        ...(options.cancelDelay ? { CANCEL_DELAY: String(options.cancelDelay) } : {}),
        ...(options.persistModel ? { MODEL_FILE: join(dir, 'model') } : {}),
        ...(options.loadedModel ? { LOADED_MODEL: options.loadedModel } : {}),
        ...(options.replayUpdates ? { REPLAY_UPDATES: JSON.stringify(options.replayUpdates) } : {}),
        ...(options.promptUpdates ? { PROMPT_UPDATES: JSON.stringify(options.promptUpdates) } : {}),
        ...(options.diagnosticChunks
          ? { DIAGNOSTIC_CHUNKS: JSON.stringify(options.diagnosticChunks) }
          : {})
      }
    })
  }
  const ctx = { workspaceId: dir, workspacePath: dir }
  const calls = async (): Promise<Call[]> =>
    (
      await Bun.file(log)
        .text()
        .catch(() => '')
    )
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line) as Call)
  const send = (sessionId: string, content: string, model?: string) =>
    sendAcpMessage(config, { ...ctx, sessionId, isNew: false, content, model })
  const load = (sessionId: string) => ensureAcpSessionLive(config, { ...ctx, sessionId })
  const events = (sessionId: string) => getLiveAcpEvents(ctx.workspaceId, sessionId) ?? []
  return { dir, ctx, config, calls, send, load, events }
}
function turns(events: StreamEvent[]): Turn[] {
  return events.flatMap(e => (e.kind === 'turn' ? [e.turn] : []))
}
async function until(check: () => Promise<boolean> | boolean) {
  const deadline = Date.now() + 3000
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error('Fixture did not reach expected state')
    await Bun.sleep(5)
  }
}
afterEach(async () => {
  forgetAllAcpSessions()
  killAllAcpClients()
})
afterAll(async () => {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true })
})

describe('ACP chat lifecycle', () => {
  test('concurrent cold reads share one complete load and remain unreadable while loading', async () => {
    const agent = await fixture()
    const first = agent.load('one')
    await until(async () => (await agent.calls()).some(c => c.method === 'session/load'))
    expect(getLiveAcpEvents(agent.ctx.workspaceId, 'one')).toBeNull()
    const second = agent.load('one')
    const [a, b] = await Promise.all([first, second])
    expect(a).toEqual(b)
    expect(turns(a).map(t => t.parts[0])).toEqual([
      { type: 'text', text: 'earlier' },
      { type: 'text', text: 'history' }
    ])
    expect((await agent.calls()).filter(c => c.method === 'session/load')).toHaveLength(1)
  })

  test('a send waits for replay and retains the confirmed loaded model', async () => {
    const agent = await fixture()
    const load = agent.load('one')
    const send = agent.send('one', 'hello', 'model-a')
    await Promise.all([load, send])
    const methods = (await agent.calls()).map(c => c.method)
    expect(methods).toEqual(['initialize', 'session/load', 'session/set_mode', 'session/prompt'])
    expect(turns(agent.events('one')).at(-1)?.meta?.model).toBe('model-a')
  })

  test('two chats and model discovery use separate processes without displacing context', async () => {
    const agent = await fixture()
    await Promise.all([agent.load('one'), agent.load('two')])
    await listAcpModels(agent.config, agent.ctx)
    await Promise.all([agent.send('one', 'first'), agent.send('two', 'second')])
    const calls = await agent.calls()
    const ids = calls
      .filter(c => c.method === 'session/load' || c.method === 'session/new')
      .map(c => c.pid)
    expect(new Set(ids).size).toBe(3)
    expect(turns(agent.events('one')).at(-1)?.parts).toEqual([
      { type: 'text', text: 'model-a:first' }
    ])
    expect(turns(agent.events('two')).at(-1)?.parts).toEqual([
      { type: 'text', text: 'model-a:second' }
    ])
  })

  test('queued model settings apply only after the preceding turn completes', async () => {
    const agent = await fixture()
    await agent.load('one')
    const first = agent.send('one', 'first', 'model-a')
    await until(async () => (await agent.calls()).some(c => c.method === 'session/prompt'))
    await agent.send('one', 'second', 'model-b')
    expect((await agent.calls()).some(c => c.method === 'session/set_model')).toBe(false)
    await first
    await until(() => getAcpActiveSessions('fx').length === 0)
    const replies = turns(agent.events('one')).filter(t => t.meta?.usage)
    expect(replies.map(t => t.meta?.model)).toEqual(['model-a', 'model-b'])
    expect(replies.map(t => t.parts)).toEqual([
      [{ type: 'text', text: 'model-a:first' }],
      [{ type: 'text', text: 'model-b:second' }]
    ])
  })

  test('failed model changes stop the send instead of using a different model', async () => {
    const agent = await fixture()
    await agent.load('one')
    await agent.send('one', 'hello', 'bad')
    expect((await agent.calls()).filter(c => c.method === 'session/prompt')).toHaveLength(0)
  })

  test('tool-only turns keep usage and unresolved tools never become successful', async () => {
    const agent = await fixture()
    await agent.send('one', 'tool-only')
    expect(turns(agent.events('one')).at(-1)?.meta?.usage?.totalTokens).toBe(5)
    await agent.send('one', 'unfinished')
    const part = turns(agent.events('one')).at(-1)?.parts[0]
    expect(part?.type === 'tool-call' && part.call.state).toBe('error')
    expect(part?.type === 'tool-call' && part.call.errorText).toContain('without reporting')
  })

  test('cancellation drops queued work and marks unfinished calls honestly', async () => {
    const agent = await fixture()
    await agent.load('one')
    const running = agent.send('one', 'first')
    await until(() => turns(agent.events('one')).some(t => t.parts[0]?.type === 'tool-call'))
    await agent.send('one', 'queued')
    await interruptAcpRun(agent.config, { workspaceId: agent.ctx.workspaceId, sessionId: 'one' })
    await running
    const calls = (await agent.calls()).filter(c => c.method === 'session/prompt')
    expect(calls).toHaveLength(1)
    const part = turns(agent.events('one')).at(-1)?.parts[0]
    expect(part?.type === 'tool-call' && part.call.state).toBe('error')
    expect(getAcpActiveSessions('fx')).toEqual([])
  })

  test('process exit cannot drain queued work through a fresh client', async () => {
    const agent = await fixture()
    await agent.load('one')
    const running = agent.send('one', 'crash')
    await until(async () => (await agent.calls()).some(c => c.method === 'session/prompt'))
    await agent.send('one', 'queued')
    await running
    expect((await agent.calls()).filter(c => c.method === 'session/prompt')).toHaveLength(1)
    expect(getLiveAcpEvents(agent.ctx.workspaceId, 'one')).toBeNull()
    await agent.send('one', 'recovered')
    expect((await agent.calls()).filter(c => c.method === 'session/load')).toHaveLength(2)
    expect(turns(agent.events('one')).at(-1)?.parts).toEqual([
      { type: 'text', text: 'model-a:recovered' }
    ])
  })

  test('forget invalidates pending attachment and releases its owned process', async () => {
    const agent = await fixture()
    const load = agent.load('one').catch(error => error)
    await until(async () => (await agent.calls()).some(c => c.method === 'session/load'))
    const client = await getAcpClient({
      ...(await agent.config.spawn(agent.ctx)),
      scope: 'chat:one'
    })
    forgetAcpSession(agent.ctx.workspaceId, 'one')
    expect(await load).toBeInstanceOf(Error)
    expect(client.isAlive()).toBe(false)
    expect(getLiveAcpEvents(agent.ctx.workspaceId, 'one')).toBeNull()
  })

  test('real-id reads await policy setup while a new chat is still connecting', async () => {
    const agent = await fixture({ modeDelay: 150 })
    const sending = sendAcpMessage(agent.config, {
      ...agent.ctx,
      sessionId: 'temporary',
      isNew: true,
      content: 'first'
    })
    await until(async () => (await agent.calls()).some(call => call.method === 'session/set_mode'))
    const modeCall = (await agent.calls()).find(call => call.method === 'session/set_mode')!
    const realId = modeCall.params.sessionId as string
    expect(getLiveAcpEvents(agent.ctx.workspaceId, realId)).toBeNull()
    let readFinished = false
    const reading = agent.load(realId).then(events => {
      readFinished = true
      return events
    })
    await Bun.sleep(20)
    expect(readFinished).toBe(false)
    await reading
    expect(getLiveAcpEvents(agent.ctx.workspaceId, realId)).not.toBeNull()
    await sending
    expect((await agent.calls()).filter(call => call.method === 'session/load')).toHaveLength(0)
  })

  test('a temporary-id alias resumes its canonical session after process exit', async () => {
    const agent = await fixture()
    await sendAcpMessage(agent.config, {
      ...agent.ctx,
      sessionId: 'temporary',
      isNew: true,
      content: 'first'
    })
    const creation = (await agent.calls()).find(call => call.method === 'session/new')!
    const realId = `new-${creation.pid}`
    killAcpWorkspace(agent.ctx.workspacePath, 'fx')
    expect(getLiveAcpEvents(agent.ctx.workspaceId, 'temporary')).toBeNull()
    await agent.load('temporary')
    const loads = (await agent.calls()).filter(call => call.method === 'session/load')
    expect(loads).toHaveLength(1)
    expect(loads[0]?.params.sessionId).toBe(realId)
    expect(loads[0]?.pid).not.toBe(creation.pid)
    expect(agent.events('temporary')).toEqual(agent.events(realId))
  })

  for (const phase of ['before initialization', 'during session creation'] as const) {
    test(`stop ${phase} prevents the first prompt from starting`, async () => {
      const agent = await fixture({ newDelay: 100 })
      const sending = sendAcpMessage(agent.config, {
        ...agent.ctx,
        sessionId: 'temporary',
        isNew: true,
        content: 'do not run'
      })
      if (phase === 'during session creation') {
        await until(async () => (await agent.calls()).some(call => call.method === 'session/new'))
      }
      await interruptAcpRun(agent.config, {
        workspaceId: agent.ctx.workspaceId,
        sessionId: 'temporary'
      })
      await sending
      expect((await agent.calls()).filter(call => call.method === 'session/prompt')).toHaveLength(0)
      expect(getAcpActiveSessions('fx')).toEqual([])
      expect(getLiveAcpEvents(agent.ctx.workspaceId, 'temporary')).toBeNull()
    })
  }

  test('follow-ups sent after stop drain in order when cancellation settles', async () => {
    const agent = await fixture({ cancelDelay: 80 })
    await agent.load('one')
    const running = agent.send('one', 'first')
    await until(async () => (await agent.calls()).some(call => call.method === 'session/prompt'))
    await agent.send('one', 'drop this queued message')
    await interruptAcpRun(agent.config, { workspaceId: agent.ctx.workspaceId, sessionId: 'one' })
    await agent.send('one', 'after stop')
    await running
    await until(() => getAcpActiveSessions('fx').length === 0)
    const texts = async () =>
      (await agent.calls())
        .filter(call => call.method === 'session/prompt')
        .map(
          call =>
            (call.params.prompt as { type: string; text?: string }[]).find(
              block => block.type === 'text'
            )?.text
        )
    expect(await texts()).toEqual(['first', 'after stop'])
    await agent.send('one', 'third')
    expect(await texts()).toEqual(['first', 'after stop', 'third'])
  })

  test('a partial settings failure reloads the confirmed model before the next prompt', async () => {
    const agent = await fixture({ persistModel: true })
    agent.config.applySettings = async (client, sessionId, settings, state) => {
      let confirmed = state
      if (settings.model && settings.model !== state.currentModelId) {
        await client.rpc('session/set_model', { sessionId, modelId: settings.model })
        confirmed = { ...state, currentModelId: settings.model }
      }
      // Like a model switch that succeeds before the new model rejects effort.
      if (settings.effort === 'unsupported') throw new Error('Effort is unavailable')
      return confirmed
    }
    await agent.load('one')
    await sendAcpMessage(agent.config, {
      ...agent.ctx,
      sessionId: 'one',
      isNew: false,
      content: 'do not prompt after settings fail',
      model: 'model-b',
      effort: 'unsupported'
    })
    expect(getLiveAcpEvents(agent.ctx.workspaceId, 'one')).toBeNull()
    expect((await agent.calls()).filter(call => call.method === 'session/prompt')).toHaveLength(0)
    expect(await Bun.file(join(agent.dir, 'model')).text()).toBe('model-b')
    await agent.send('one', 'recovered', 'model-a')
    const calls = await agent.calls()
    const loads = calls.filter(call => call.method === 'session/load')
    expect(loads).toHaveLength(2)
    expect(loads[0]?.pid).not.toBe(loads[1]?.pid)
    expect(
      calls.filter(call => call.method === 'session/set_model').map(call => call.params.modelId)
    ).toEqual(['model-b', 'model-a'])
    expect(turns(agent.events('one')).at(-1)?.parts).toEqual([
      { type: 'text', text: 'model-a:recovered' }
    ])
    expect(turns(agent.events('one')).at(-1)?.meta?.model).toBe('model-a')
  })

  test('replay preserves adjacent user and assistant message identities across chunks', async () => {
    const chunk = (sessionUpdate: string, messageId: string, text: string) => ({
      sessionUpdate,
      messageId,
      content: { type: 'text', text }
    })
    const agent = await fixture({
      replayUpdates: [
        chunk('user_message_chunk', 'u1', 'first '),
        chunk('user_message_chunk', 'u1', 'user'),
        chunk('user_message_chunk', 'u2', 'second user'),
        chunk('agent_message_chunk', 'a1', 'first '),
        chunk('agent_message_chunk', 'a1', 'assistant'),
        chunk('agent_message_chunk', 'a2', 'second '),
        chunk('agent_message_chunk', 'a2', 'assistant')
      ]
    })
    const replay = turns(await agent.load('one'))
    expect(replay.map(turn => ({ role: turn.role, parts: turn.parts }))).toEqual([
      { role: 'user', parts: [{ type: 'text', text: 'first user' }] },
      { role: 'user', parts: [{ type: 'text', text: 'second user' }] },
      { role: 'assistant', parts: [{ type: 'text', text: 'first assistant' }] },
      { role: 'assistant', parts: [{ type: 'text', text: 'second assistant' }] }
    ])
    expect(new Set(replay.map(turn => turn.id)).size).toBe(4)
  })

  test('split diagnostics become notices without leaking a partial streaming preview', async () => {
    const chunks = ['[con', 'text] workspace instructions were omitted outside the home directory.']
    const agent = await fixture({ diagnosticChunks: chunks })
    agent.config.isOperationalMessage = isFxOperationalMessage
    await sendAcpMessage(agent.config, {
      ...agent.ctx,
      sessionId: 'one',
      isNew: false,
      content: 'a normal reply long enough to produce a streaming preview',
      stream: true
    })
    const frames = getClientFrameLog(agent.ctx.workspaceId).map(
      entry => entry.frame as ServerMessage
    )
    const previews = frames.flatMap(frame =>
      'type' in frame && frame.type === 'preview' ? [frame] : []
    )
    expect(previews.length).toBeGreaterThan(0)
    expect(previews.every(frame => frame.blocks.every(block => !block.text.includes('[con')))).toBe(
      true
    )
    const notices = agent
      .events('one')
      .flatMap(event => (event.kind === 'notice' ? [event.notice] : []))
    expect(
      notices.flatMap(notice => (notice.kind === 'warning' ? [notice.message] : []))
    ).toContain(chunks.join(''))
    const assistantText = turns(agent.events('one')).flatMap(turn =>
      turn.role === 'assistant'
        ? turn.parts.flatMap(part => (part.type === 'text' ? [part.text] : []))
        : []
    )
    expect(assistantText.every(text => !text.includes('[context]'))).toBe(true)
    // Every emitted preview belongs to an eventual assistant turn, so the
    // client's existing apiMessageId clearing leaves no diagnostic fragment.
    const finalized = new Set(turns(agent.events('one')).map(turn => turn.meta?.apiMessageId))
    expect(previews.every(frame => finalized.has(frame.messageId))).toBe(true)
  })

  test('an identified warning cannot swallow unlabelled thoughts before the answer', async () => {
    // Captured fx order: a skill warning has a messageId, thought chunks omit
    // it entirely, and the final answer introduces a different messageId.
    const warning = 'skill discovery warning: a fixture skill was skipped'
    const reasoning = 'Need to compute the answer carefully.'
    const agent = await fixture({
      promptUpdates: [
        {
          sessionUpdate: 'agent_message_chunk',
          messageId: 'warning',
          content: { type: 'text', text: warning }
        },
        { sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'Need' } },
        {
          sessionUpdate: 'agent_thought_chunk',
          content: { type: 'text', text: reasoning.slice(4) }
        }
      ]
    })
    agent.config.isOperationalMessage = isFxOperationalMessage
    await sendAcpMessage(agent.config, {
      ...agent.ctx,
      sessionId: 'one',
      isNew: false,
      content: 'the final answer',
      stream: true
    })
    const frames = getClientFrameLog(agent.ctx.workspaceId).map(
      entry => entry.frame as ServerMessage
    )
    const previews = frames.flatMap(frame =>
      'type' in frame && frame.type === 'preview' ? [frame] : []
    )
    // Even the first short thought streams immediately, without trailing
    // warning text that would make the UI collapse its Thinking row.
    expect(previews[0]?.blocks).toEqual([{ index: 0, kind: 'reasoning', text: 'Need' }])
    expect(
      previews.every(frame => frame.blocks.every(block => !block.text.includes(warning)))
    ).toBe(true)
    const completed = turns(agent.events('one')).at(-1)!
    expect(completed.parts).toEqual([
      { type: 'reasoning', text: reasoning },
      { type: 'text', text: 'model-a:the final answer' }
    ])
    const warnings = agent
      .events('one')
      .flatMap(event =>
        event.kind === 'notice' && event.notice.kind === 'warning' ? [event.notice.message] : []
      )
    expect(warnings).toEqual([warning])
    expect(previews.every(frame => frame.messageId === completed.meta?.apiMessageId)).toBe(true)
  })

  test('classifying a later warning preserves thoughts already in the accumulator', async () => {
    const reasoning = 'This is a genuine thought before the operational warning.'
    const warning = 'skill discovery warning: the next skill was skipped'
    const agent = await fixture({
      promptUpdates: [
        { sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: reasoning } },
        {
          sessionUpdate: 'agent_message_chunk',
          messageId: 'warning',
          content: { type: 'text', text: warning }
        }
      ]
    })
    agent.config.isOperationalMessage = isFxOperationalMessage
    await sendAcpMessage(agent.config, {
      ...agent.ctx,
      sessionId: 'one',
      isNew: false,
      content: 'answer',
      stream: true
    })
    const assistantParts = turns(agent.events('one'))
      .filter(turn => turn.role === 'assistant')
      .flatMap(turn => turn.parts)
    expect(assistantParts).toContainEqual({ type: 'reasoning', text: reasoning })
    expect(assistantParts).not.toContainEqual({ type: 'text', text: warning })
    const previews = getClientFrameLog(agent.ctx.workspaceId).flatMap(entry => {
      const frame = entry.frame as ServerMessage
      return 'type' in frame && frame.type === 'preview' ? [frame] : []
    })
    expect(
      previews.every(frame => frame.blocks.every(block => !block.text.includes(warning)))
    ).toBe(true)
  })

  test.each([false, true])(
    'thought-only output survives without an answer (cancel=%s)',
    async cancel => {
      const reasoning = 'Need'
      const agent = await fixture({
        promptUpdates: [
          { sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: reasoning } }
        ]
      })
      agent.config.isOperationalMessage = isFxOperationalMessage
      const send = sendAcpMessage(agent.config, {
        ...agent.ctx,
        sessionId: 'one',
        isNew: false,
        content: 'unfinished',
        stream: true
      })
      await until(() =>
        getClientFrameLog(agent.ctx.workspaceId).some(entry => {
          const frame = entry.frame as ServerMessage
          return (
            'type' in frame &&
            frame.type === 'preview' &&
            frame.blocks.some(block => block.kind === 'reasoning')
          )
        })
      )
      if (cancel)
        await interruptAcpRun(agent.config, {
          workspaceId: agent.ctx.workspaceId,
          sessionId: 'one'
        })
      await send
      const completed = turns(agent.events('one')).at(-1)!
      expect(completed.parts).toEqual([{ type: 'reasoning', text: reasoning }])
      expect(completed.meta?.stopReason).toBe(cancel ? 'cancelled' : 'end_turn')
    }
  )

  test('cold resume can discover the provider default without displacing its loaded chat', async () => {
    const agent = await fixture({ loadedModel: 'model-b' })
    agent.config.mapModels = fxModels
    agent.config.defaultModel = async ctx =>
      (await listAcpModels(agent.config, ctx)).find(model => model.value === 'default')
        ?.resolvedModel
    await agent.load('one')
    await agent.send('one', 'use the provider default', 'default')
    const calls = await agent.calls()
    const loaded = calls.find(call => call.method === 'session/load')!
    const discovered = calls.find(call => call.method === 'session/new')!
    expect(discovered.pid).not.toBe(loaded.pid)
    expect(
      calls.filter(call => call.method === 'session/set_model').map(call => call.params.modelId)
    ).toEqual(['model-a'])
    expect(turns(agent.events('one')).at(-1)?.parts).toEqual([
      { type: 'text', text: 'model-a:use the provider default' }
    ])
  })

  test('cold load publishes restored effort choices while preserving the provider default', async () => {
    const agent = await fixture({ loadedModel: 'model-b' })
    agent.config.modelState = result => {
      const model = result.models?.currentModelId
      const levels = model === 'model-b' ? ['auto', 'high'] : ['auto', 'low']
      return {
        ...result.models,
        defaultModelId: model,
        configOptions: [
          {
            id: 'effort',
            type: 'select',
            name: 'Effort',
            category: 'thought_level',
            currentValue: model === 'model-b' ? 'high' : 'auto',
            options: levels.map(value => ({ value, name: value }))
          }
        ]
      }
    }
    agent.config.mapModels = fxModels
    agent.config.defaultModel = async ctx =>
      (await listAcpModels(agent.config, ctx)).find(model => model.value === 'default')
        ?.resolvedModel
    const initial = await listAcpModels(agent.config, agent.ctx)
    expect(initial.find(model => model.value === 'default')?.resolvedModel).toBe('model-a')
    expect(initial.find(model => model.value === 'model-b')?.supportsEffort).toBeUndefined()

    let readyWhenPublished = false
    const refresh = spyOn(agentStore, 'refresh').mockImplementation(async workspace => {
      if (workspace.id === agent.ctx.workspaceId) {
        readyWhenPublished = getLiveAcpEvents(workspace.id, 'one') !== null
      }
      return { status: 'available' }
    })
    try {
      await agent.load('one')
      const restored = await listAcpModels(agent.config, agent.ctx)
      expect(restored.find(model => model.value === 'default')?.resolvedModel).toBe('model-a')
      expect(restored.find(model => model.value === 'model-b')?.supportedEffortLevels).toEqual([
        'auto',
        'high'
      ])
      expect(restored.find(model => model.value === 'model-b')?.defaultEffort).toBe('auto')
      expect(readyWhenPublished).toBe(true)
      expect(refresh).toHaveBeenCalledWith({
        id: agent.ctx.workspaceId,
        path: agent.ctx.workspacePath,
        type: 'fx'
      })
      expect((await agent.calls()).filter(call => call.method === 'session/new')).toHaveLength(1)
    } finally {
      refresh.mockRestore()
    }
  })
})
