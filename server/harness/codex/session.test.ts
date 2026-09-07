import { afterEach, describe, expect, spyOn, test } from 'bun:test'

import type { BroadcastFrame, StreamEvent } from '@/lib/types'

import { getClientFrameLog } from '../debug'
import { agentStore } from '../../agent'
import { addUpload } from '../../uploads'
import * as clients from './client'
import {
  ensureCodexSessionLive,
  getCodexActiveSessions,
  getLiveCodexEvents,
  getLatestCodexSessionId,
  interruptCodexRun,
  sendCodexMessage
} from './session'
import { CodexRpcError, type Json, type NotificationListener } from './transport'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup()
})

function fixture() {
  const workspaceId = crypto.randomUUID()
  const input = { workspaceId, workspacePath: `/test/${workspaceId}`, sessionId: 'session' }
  const listeners = new Set<NotificationListener>()
  const calls: { method: string; params: Json }[] = []
  const handlers = new Map<string, (params: Json) => unknown>()
  let nextTurn = 0
  const client: clients.CodexClient = {
    workspacePath: input.workspacePath,
    cliVersion: '0.147.0',
    supportsAdditionalContext: true,
    isAlive: () => true,
    onNotification(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    async rpc<T>(method: string, params: Json = {}): Promise<T> {
      calls.push({ method, params })
      const handler = handlers.get(method)
      if (handler) return (await handler(params)) as T
      if (method === 'thread/resume')
        return { thread: { id: input.sessionId, turns: [], status: { type: 'idle' } } } as T
      if (method === 'turn/start')
        return { turn: { id: `turn-${++nextTurn}`, status: 'inProgress', items: [] } } as T
      if (method === 'account/read')
        return { account: { type: 'chatgpt' }, requiresOpenaiAuth: true } as T
      return {} as T
    }
  }
  const spy = spyOn(clients, 'getCodexClient').mockResolvedValue(client)
  const availabilitySpy = spyOn(agentStore, 'refresh').mockResolvedValue({ status: 'available' })
  const emit = (method: string, params: Json = {}) => {
    for (const listener of [...listeners])
      listener(method, { threadId: input.sessionId, ...params })
  }
  cleanups.push(
    () => availabilitySpy.mockRestore(),
    () => spy.mockRestore(),
    () => emit('__exit')
  )
  return {
    input,
    client,
    calls,
    handlers,
    emit,
    listeners,
    frames: () => getClientFrameLog(workspaceId).map(row => row.frame as BroadcastFrame),
    active: () => getCodexActiveSessions().some(row => row.workspaceId === workspaceId),
    events: () => getLiveCodexEvents(workspaceId, input.sessionId) ?? [],
    send: (content = 'hello', extra: Partial<Parameters<typeof sendCodexMessage>[0]> = {}) =>
      sendCodexMessage({ ...input, content, isNew: false, ...extra })
  }
}

function texts(events: StreamEvent[]) {
  return events.flatMap(event =>
    event.kind === 'turn'
      ? event.turn.parts.flatMap(part => (part.type === 'text' ? [part.text] : []))
      : []
  )
}

describe('Codex live session lifecycle', () => {
  test('a rejected fresh start after no-active-turn clears the obsolete active turn', async () => {
    const f = fixture()
    await f.send()
    f.handlers.set('turn/steer', () => {
      throw new CodexRpcError('No active turn', -32600)
    })
    f.handlers.set('turn/start', () => {
      throw new CodexRpcError('Model unavailable', -32600)
    })
    await f.send('follow up')
    expect(f.active()).toBe(false)
    expect(f.frames().at(-1)).toMatchObject({ kind: 'error', terminal: true })
  })
  test('native active flags update waiting activity and survive hydration', async () => {
    const f = fixture()
    f.handlers.set('thread/resume', () => ({
      thread: {
        id: 'session',
        status: { type: 'active', activeFlags: ['waitingOnApproval'] },
        turns: [{ id: 'busy', status: 'inProgress', items: [] }]
      }
    }))
    await ensureCodexSessionLive(f.input)
    expect(
      getCodexActiveSessions().find(row => row.workspaceId === f.input.workspaceId)?.activity
    ).toBe('requires-action')
    f.emit('thread/status/changed', { status: { type: 'active', activeFlags: [] } })
    expect(f.frames().at(-1)).toMatchObject({ type: 'status', activity: 'running' })
    f.emit('thread/status/changed', {
      status: { type: 'active', activeFlags: ['waitingOnUserInput'] }
    })
    expect(f.frames().at(-1)).toMatchObject({ type: 'status', activity: 'requires-action' })
    f.emit('turn/completed', { turn: { id: 'busy', status: 'completed', items: [] } })
    expect(f.active()).toBe(false)
    expect(f.frames().at(-1)).toMatchObject({ type: 'status', activity: 'idle' })
  })

  test('unloaded or closed chats release their subscriptions and resume on the next send', async () => {
    for (const method of [
      'thread/closed',
      'thread/status/changed',
      'thread/archived',
      'thread/deleted'
    ]) {
      const f = fixture()
      await f.send()
      expect(getLatestCodexSessionId(f.input.workspaceId)).toBe('session')
      f.emit(method, { status: { type: 'notLoaded' } })
      expect(getLatestCodexSessionId(f.input.workspaceId)).toBeUndefined()
      expect(f.active()).toBe(false)
      expect(f.listeners.size).toBe(0)
      expect(getLiveCodexEvents(f.input.workspaceId, f.input.sessionId)).toBeNull()
      await f.send('after closure')
      expect(f.calls.filter(call => call.method === 'thread/resume')).toHaveLength(2)
      expect(f.calls.at(-1)?.method).toBe('turn/start')
    }
  })

  test('closure during resume does not return a dead record', async () => {
    const f = fixture()
    f.handlers.set('thread/resume', () => {
      f.emit('thread/closed')
      return { thread: { id: 'session', turns: [] } }
    })
    await expect(ensureCodexSessionLive(f.input)).rejects.toThrow('closed this chat')
    expect(f.listeners.size).toBe(0)
  })

  test('plans upsert and warnings/reroutes reach the chat without terminating its turn', async () => {
    const f = fixture()
    await f.send()
    for (const status of ['inProgress', 'completed'])
      f.emit('turn/plan/updated', {
        turnId: 'turn-1',
        explanation: null,
        plan: [{ step: 'Audit', status }]
      })
    const plan = f
      .events()
      .filter(
        event =>
          event.kind === 'turn' &&
          event.turn.parts.some(
            part => part.type === 'tool-call' && part.call.name === 'update_plan'
          )
      )
    expect(plan).toHaveLength(1)
    expect(JSON.stringify(plan)).toContain('[x] Audit')
    f.emit('warning', { message: 'Thread warning' })
    f.emit('configWarning', { threadId: null, summary: 'Configuration warning' })
    f.emit('model/rerouted', {
      turnId: 'turn-1',
      fromModel: 'a',
      toModel: 'b',
      reason: 'rateLimit'
    })
    const notices = f.events().flatMap(event => (event.kind === 'notice' ? [event.notice] : []))
    expect(notices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'warning', message: 'Thread warning' }),
        expect.objectContaining({ kind: 'warning', message: 'Configuration warning' }),
        expect.objectContaining({ kind: 'model-change', model: 'b', prev: 'a' })
      ])
    )
    expect(f.active()).toBe(true)
  })

  test('command deltas are batched, bounded and replaced by authoritative final output', async () => {
    const f = fixture()
    await f.send()
    const item = { id: 'cmd', type: 'commandExecution', command: 'build', status: 'inProgress' }
    f.emit('item/started', { item })
    const output = () => {
      const event = f
        .events()
        .find(
          event =>
            event.kind === 'turn' &&
            event.turn.parts.some(
              part => part.type === 'tool-call' && part.call.toolCallId === 'cmd'
            )
        )
      const part = event?.kind === 'turn' ? event.turn.parts[0] : null
      return part?.type === 'tool-call' ? part.call.output : undefined
    }
    f.emit('item/commandExecution/outputDelta', { itemId: 'cmd', delta: 'first\n' })
    f.emit('item/commandExecution/outputDelta', { itemId: 'cmd', delta: 'second\n' })
    expect(output()).toBeUndefined()
    await Bun.sleep(50)
    expect(output()).toBe('first\nsecond\n')
    f.emit('item/commandExecution/outputDelta', { itemId: 'cmd', delta: 'x'.repeat(100_000) })
    await Bun.sleep(50)
    expect(String(output()).length).toBeLessThan(66_000)
    expect(String(output())).toStartWith('[Earlier live output omitted]')
    f.emit('item/commandExecution/outputDelta', { itemId: 'cmd', delta: 'pending' })
    f.emit('item/completed', { item: { ...item, status: 'completed', aggregatedOutput: 'final' } })
    f.emit('item/commandExecution/outputDelta', { itemId: 'cmd', delta: 'late' })
    await Bun.sleep(50)
    expect(output()).toBe('final')
  })

  test('image validation uses the running model for steering and permits legacy catalogs', async () => {
    const f = fixture()
    const catalog = spyOn(clients, 'getCodexModelCatalog').mockResolvedValue([
      { id: 'text', model: 'text', displayName: 'Text model', inputModalities: ['text'] },
      {
        id: 'vision',
        model: 'vision',
        displayName: 'Vision model',
        inputModalities: ['text', 'image']
      },
      { id: 'legacy', model: 'legacy', displayName: 'Legacy' }
    ])
    cleanups.push(() => catalog.mockRestore())
    const upload = await addUpload({
      workspaceId: f.input.workspaceId,
      filename: 'pixel.gif',
      mediaType: 'image/gif',
      bytes: Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')
    })
    await f.send('inspect', { model: 'text', attachments: [upload.id] })
    expect(f.calls.some(call => call.method === 'turn/start')).toBe(false)
    expect(f.frames().at(-1)).toMatchObject({
      kind: 'error',
      content: expect.stringContaining('does not accept images')
    })
    await f.send('start text turn', { model: 'text' })
    await f.send('switch mid-turn', { model: 'vision', attachments: [upload.id] })
    expect(f.calls.some(call => call.method === 'turn/steer')).toBe(false)
    expect(f.active()).toBe(true)
    f.emit('turn/completed', { turn: { id: 'turn-1', status: 'completed', items: [] } })
    await f.send('legacy image', { model: 'legacy', attachments: [upload.id] })
    expect(f.calls.at(-1)).toMatchObject({
      method: 'turn/start',
      params: {
        model: 'legacy',
        input: expect.arrayContaining([expect.objectContaining({ type: 'image' })])
      }
    })
  })
  test('concurrent resumes subscribe once and replay frames received before the response', async () => {
    const f = fixture()
    const resumed = deferred<unknown>()
    f.handlers.set('thread/resume', () => resumed.promise)
    const a = ensureCodexSessionLive(f.input)
    const b = ensureCodexSessionLive(f.input)
    await Bun.sleep(0)
    expect(f.calls.filter(call => call.method === 'thread/resume')).toHaveLength(1)
    f.emit('item/completed', { item: { type: 'agentMessage', id: 'live', text: 'live response' } })
    f.emit('turn/started', { turn: { id: 'active', status: 'inProgress', items: [] } })
    resumed.resolve({
      thread: {
        id: 'session',
        turns: [
          {
            id: 'old',
            status: 'completed',
            items: [
              { type: 'userMessage', id: 'user', content: [{ type: 'text', text: 'history' }] }
            ]
          }
        ]
      }
    })
    const [first, second] = await Promise.all([a, b])
    expect(texts(first)).toEqual(['history', 'live response'])
    expect(second).toEqual(first)
    expect(f.listeners.size).toBe(1)
    expect(f.active()).toBe(true)
  })

  test('hydrates a running turn so a resumed chat can be stopped', async () => {
    const f = fixture()
    f.handlers.set('thread/resume', () => ({
      thread: { id: 'session', turns: [{ id: 'busy', status: 'inProgress', items: [] }] }
    }))
    await ensureCodexSessionLive(f.input)
    expect(f.active()).toBe(true)
    await interruptCodexRun(f.input)
    expect(f.calls.at(-1)).toEqual({
      method: 'turn/interrupt',
      params: { threadId: 'session', turnId: 'busy' }
    })
    f.emit('turn/completed', { turn: { id: 'busy', status: 'interrupted', items: [] } })
    expect(f.active()).toBe(false)
    expect(f.frames().filter(frame => 'kind' in frame && frame.kind === 'stopped')).toHaveLength(1)
  })

  test('a send during history loading waits for resume and steers the hydrated turn', async () => {
    const f = fixture()
    const resumed = deferred<unknown>()
    f.handlers.set('thread/resume', () => resumed.promise)
    const loading = ensureCodexSessionLive(f.input)
    await Bun.sleep(0)
    const sending = f.send('follow up')
    await Bun.sleep(0)
    expect(f.calls.map(call => call.method)).toEqual(['thread/resume'])
    resumed.resolve({
      thread: { id: 'session', turns: [{ id: 'busy', status: 'inProgress', items: [] }] }
    })
    await Promise.all([loading, sending])
    expect(f.calls.filter(call => call.method === 'turn/start')).toHaveLength(0)
    expect(f.calls.find(call => call.method === 'turn/steer')?.params.expectedTurnId).toBe('busy')
    expect(texts(f.events())).toContain('follow up')
  })

  test('failed resume releases subscriptions', async () => {
    const f = fixture()
    const resumed = deferred<unknown>()
    f.handlers.set('thread/resume', () => resumed.promise)
    const loading = ensureCodexSessionLive(f.input)
    await Bun.sleep(0)
    resumed.reject(new Error('History unavailable'))
    await expect(loading).rejects.toThrow('History unavailable')
    expect(f.listeners.size).toBe(0)
    expect(getLiveCodexEvents(f.input.workspaceId, f.input.sessionId)).toBeNull()
  })

  test('completion before start acknowledgement never resurrects processing', async () => {
    const f = fixture()
    f.handlers.set('turn/start', () => {
      f.emit('turn/started', { turn: { id: 'fast', status: 'inProgress', items: [] } })
      f.emit('turn/completed', {
        turn: {
          id: 'fast',
          status: 'completed',
          items: [{ type: 'agentMessage', id: 'a', text: 'done' }]
        }
      })
      return { turn: { id: 'fast', status: 'inProgress', items: [] } }
    })
    await f.send()
    expect(f.active()).toBe(false)
    expect(texts(f.events())).toContain('done')
  })

  test('retryable errors keep the turn stoppable and do not emit a terminal error', async () => {
    const f = fixture()
    await f.send()
    f.emit('error', { turnId: 'turn-1', willRetry: true, error: { message: 'Reconnecting' } })
    expect(f.active()).toBe(true)
    expect(f.frames().some(frame => 'kind' in frame && frame.kind === 'error')).toBe(false)
    expect(
      f.events().some(event => event.kind === 'notice' && event.notice.kind === 'api-retry')
    ).toBe(true)
  })

  test('serializes concurrent sends into a start then steer, preserving user IDs', async () => {
    const f = fixture()
    const accepted = deferred<unknown>()
    f.handlers.set('turn/start', () => accepted.promise)
    const a = f.send('first', { optimisticId: 'first-id' })
    const b = f.send('second', { optimisticId: 'second-id' })
    await Bun.sleep(0)
    expect(f.calls.filter(call => call.method === 'turn/start')).toHaveLength(1)
    accepted.resolve({ turn: { id: 'active', status: 'inProgress', items: [] } })
    await Promise.all([a, b])
    const sends = f.calls.filter(call => call.method.startsWith('turn/'))
    expect(sends.map(call => call.method)).toEqual(['turn/start', 'turn/steer'])
    expect(sends[1].params).toMatchObject({
      clientUserMessageId: 'second-id',
      expectedTurnId: 'active'
    })
    f.emit('item/completed', {
      item: {
        type: 'userMessage',
        id: 'native',
        clientId: 'second-id',
        content: [{ type: 'text', text: 'second' }]
      }
    })
    expect(texts(f.events())).toEqual(['first', 'second'])
  })

  test('does not resubmit after a timeout, auth error or turn mismatch during steering', async () => {
    const f = fixture()
    await f.send()
    for (const error of [
      new Error('request timed out'),
      new CodexRpcError('unauthorized', 401),
      new CodexRpcError('turn id mismatch', -32600)
    ]) {
      f.handlers.set('turn/steer', () => {
        throw error
      })
      await f.send('follow-up')
    }
    expect(f.calls.filter(call => call.method === 'turn/start')).toHaveLength(1)
    expect(f.active()).toBe(true)
  })

  test('starts a new turn only after a definitive no-active-turn rejection', async () => {
    const f = fixture()
    await f.send()
    f.handlers.set('turn/steer', () => {
      throw new CodexRpcError('No active turn', -32600)
    })
    await f.send('next', { fastMode: false })
    expect(f.calls.filter(call => call.method === 'turn/start')).toHaveLength(2)
    expect(f.calls.at(-1)?.params.serviceTier).toBeNull()
  })

  test('stop during start acceptance cancels queued sends and interrupts the accepted turn', async () => {
    const f = fixture()
    const accepted = deferred<unknown>()
    f.handlers.set('turn/start', () => accepted.promise)
    const a = f.send('first')
    const b = f.send('queued')
    await Bun.sleep(0)
    await interruptCodexRun(f.input)
    accepted.resolve({ turn: { id: 'active', status: 'inProgress', items: [] } })
    await Promise.all([a, b])
    expect(
      f.calls.filter(call => call.method.startsWith('turn/')).map(call => call.method)
    ).toEqual(['turn/start', 'turn/interrupt'])
    expect(texts(f.events())).toEqual(['first'])
  })

  test('fast mode is sent per turn and can be explicitly disabled', async () => {
    const f = fixture()
    await f.send('fast', { fastMode: true, effort: 'low' })
    expect(f.calls.at(-1)?.params).toMatchObject({ serviceTier: 'priority', effort: 'low' })
    f.emit('turn/completed', { turn: { id: 'turn-1', status: 'completed', items: [] } })
    await f.send('normal', { fastMode: false })
    expect(f.calls.at(-1)?.params.serviceTier).toBeNull()
  })

  test('late completion and usage from an old turn cannot affect a newer turn', async () => {
    const f = fixture()
    await f.send()
    f.emit('thread/tokenUsage/updated', {
      turnId: 'turn-1',
      tokenUsage: { last: { totalTokens: 100 } }
    })
    f.emit('turn/completed', { turn: { id: 'turn-1', status: 'completed', items: [] } })
    await f.send('next')
    f.emit('turn/completed', { turn: { id: 'turn-1', status: 'completed', items: [] } })
    expect(f.active()).toBe(true)
    f.emit('turn/completed', {
      turn: {
        id: 'turn-2',
        status: 'completed',
        items: [{ type: 'agentMessage', id: 'answer', text: 'done' }]
      }
    })
    const answer = f
      .events()
      .find(event => event.kind === 'turn' && event.turn.id.endsWith(':answer'))
    expect(answer?.kind === 'turn' && answer.turn.meta?.usage).toBeUndefined()
  })

  test('coalesces token bursts and prevents a delayed preview after item completion', async () => {
    const f = fixture()
    await f.send('stream', { stream: true })
    for (let i = 0; i < 100; i++) f.emit('item/agentMessage/delta', { itemId: 'a', delta: 'x' })
    await Bun.sleep(50)
    expect(f.frames().filter(frame => 'type' in frame && frame.type === 'preview')).toHaveLength(1)
    f.emit('item/agentMessage/delta', { itemId: 'a', delta: 'y' })
    f.emit('item/completed', { item: { type: 'agentMessage', id: 'a', text: 'final' } })
    await Bun.sleep(50)
    expect(f.frames().filter(frame => 'type' in frame && frame.type === 'preview')).toHaveLength(1)
  })

  test('process exit clears active state, unsubscribes, and allows a fresh resume', async () => {
    const f = fixture()
    await f.send()
    f.emit('__exit')
    expect(f.active()).toBe(false)
    expect(f.listeners.size).toBe(0)
    expect(f.frames().some(frame => 'kind' in frame && frame.kind === 'error')).toBe(true)
    await f.send('resume')
    expect(f.calls.filter(call => call.method === 'thread/resume')).toHaveLength(2)
  })
})
