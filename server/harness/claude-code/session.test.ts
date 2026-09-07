import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test'
import * as sdk from '@anthropic-ai/claude-agent-sdk'
import type { Options, Query, SDKMessage, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'

import * as state from '../../state'
import * as viewBuilders from '../../view-builders'
import * as workspaceEnv from '../../workspace-env'
import * as sessionConfig from '../../session-config'
import * as selectedSession from '../../selected-session'
import * as executable from '../executable'
import type { SendMessageInput } from '../types'
import * as history from './sessions'
import * as titles from './session-title'
import {
  getCCActiveSessions,
  getCCDebugSnapshot,
  interruptCCSession,
  killAllCCSessions,
  retireCCSessionsOnCliChange,
  sendCCMessage
} from './session'

const drivers: ReturnType<typeof createDriver>[] = []
const restores: Array<() => void> = []
let frames: unknown[] = []

function createDriver(prompt: AsyncIterable<SDKUserMessage>, options: Options) {
  const inputs: SDKUserMessage[] = []
  const events: SDKMessage[] = []
  let wake: (() => void) | undefined
  let closed = false
  void (async () => {
    for await (const input of prompt) inputs.push(input)
  })()
  const driver = {
    inputs,
    options,
    models: [] as Array<string | undefined>,
    flags: [] as Array<Parameters<Query['applyFlagSettings']>[0]>,
    modelError: null as Error | null,
    flagError: null as Error | null,
    beforeModel: null as (() => Promise<void>) | null,
    beforeFlags: null as (() => Promise<void>) | null,
    get closed() {
      return closed
    },
    emit(event: unknown) {
      // Protocol fixtures omit fields the session and adapter do not consume.
      events.push(event as SDKMessage)
      wake?.()
    },
    close() {
      closed = true
      wake?.()
    },
    async setModel(model?: string) {
      driver.models.push(model)
      await driver.beforeModel?.()
      if (driver.modelError) throw driver.modelError
    },
    async applyFlagSettings(settings: Parameters<Query['applyFlagSettings']>[0]) {
      driver.flags.push(settings)
      await driver.beforeFlags?.()
      if (driver.flagError) throw driver.flagError
    },
    async interrupt() {},
    async *[Symbol.asyncIterator]() {
      while (!closed) {
        if (!events.length)
          await new Promise<void>(resolve => {
            wake = resolve
          })
        while (!closed && events.length) yield events.shift()!
      }
    }
  }
  return driver
}

const input: SendMessageInput = {
  workspaceId: 'session-test',
  workspacePath: '/fake/workspace',
  sessionId: 'session-1',
  isNew: false,
  content: 'first',
  model: 'old-model'
}
const result = { type: 'result', subtype: 'success' }
const settle = () => Bun.sleep(1)
async function until(check: () => boolean) {
  for (let i = 0; i < 100 && !check(); i++) await settle()
  expect(check()).toBe(true)
}

// Attach the rejection handler immediately: a cancellation can precede the
// assertion awaiting it, and must not become an unhandled test rejection.
function send(patch: Partial<SendMessageInput> = {}) {
  const promise = sendCCMessage({ ...input, ...patch }).then(settle)
  void promise.catch(() => {})
  return promise
}

beforeEach(() => {
  frames = []
  const spies = [
    spyOn(sdk, 'query').mockImplementation(({ prompt, options }) => {
      if (typeof prompt === 'string') throw new Error('Expected streaming input')
      const d = createDriver(prompt, options ?? {})
      drivers.push(d)
      // The fake implements only the Query methods this module calls.
      return d as unknown as Query
    }),
    spyOn(history, 'claudeSessionExists').mockResolvedValue(true),
    spyOn(executable, 'requireHarnessExecutable').mockReturnValue('/fake/claude'),
    spyOn(workspaceEnv, 'resolveWorkspaceEnv').mockResolvedValue({}),
    spyOn(state, 'broadcast').mockImplementation((_id, frame) => {
      frames.push(frame)
    }),
    spyOn(viewBuilders, 'markViewBuilderBuildingBySession').mockResolvedValue(null),
    spyOn(viewBuilders, 'markViewBuilderWaitingBySession').mockResolvedValue(null),
    spyOn(viewBuilders, 'renameViewBuilderSession').mockResolvedValue(null),
    spyOn(sessionConfig, 'hasSessionConfig').mockResolvedValue(true),
    spyOn(sessionConfig, 'renameSessionConfig').mockResolvedValue(undefined),
    spyOn(selectedSession, 'renameSelectedSession').mockResolvedValue({
      changed: false,
      sessionId: null
    }),
    spyOn(titles, 'generateClaudeSessionTitle').mockResolvedValue(null)
  ]
  restores.push(...spies.map(spy => () => spy.mockRestore()))
})

afterEach(async () => {
  killAllCCSessions()
  await settle()
  for (const restore of restores.splice(0)) restore()
  drivers.length = 0
})

describe('Claude session message queue', () => {
  test('keeps follow-ups in moi until each preceding result, without state events', async () => {
    await send()
    const d = drivers[0]!
    const second = send({ content: 'second' })
    const third = send({ content: 'third' })
    await settle()
    expect(d.inputs).toHaveLength(1)
    d.emit(result)
    await second
    expect(d.inputs).toHaveLength(2)
    expect(drivers).toHaveLength(1)
    d.emit(result)
    await third
    expect(d.inputs.map(m => m.message.content)).toEqual(['first', 'second', 'third'])
    d.emit(result)
    await until(() => getCCActiveSessions().length === 0)
  })

  test('resumes queued messages on the updated CLI with their own settings', async () => {
    await send()
    const old = drivers[0]!
    const second = send({
      content: 'second',
      model: 'new-model',
      effort: 'high',
      stream: true,
      fastMode: true
    })
    retireCCSessionsOnCliChange()
    await settle()
    expect(old.closed).toBe(false)
    expect(old.inputs).toHaveLength(1)
    expect(old.models).toEqual([])
    old.emit(result)
    await second
    expect(old.closed).toBe(true)
    const next = drivers[1]!
    expect(next.options).toMatchObject({
      resume: 'session-1',
      model: 'new-model',
      effort: 'high',
      includePartialMessages: true,
      settings: { fastMode: true }
    })
    expect(next.inputs[0]?.message.content).toBe('second')
  })

  test('an idle stale session is replaced only when the next message is dispatched', async () => {
    await send()
    const old = drivers[0]!
    old.emit(result)
    await until(() => getCCActiveSessions().length === 0)
    retireCCSessionsOnCliChange()
    expect(old.closed).toBe(false)
    await send({ model: 'new-model' })
    expect(old.closed).toBe(true)
    expect(drivers[1]?.options.model).toBe('new-model')
  })

  for (const completion of [
    { type: 'system', subtype: 'task_notification', task_id: 'bg', status: 'completed' },
    { type: 'system', subtype: 'task_updated', task_id: 'bg', patch: { status: 'completed' } }
  ])
    test(`preserves background jobs until ${completion.subtype}`, async () => {
      await send()
      const old = drivers[0]!
      old.emit({
        type: 'system',
        subtype: 'task_started',
        task_type: 'local_bash',
        task_id: 'bg',
        description: 'job'
      })
      old.emit(result)
      await until(() => getCCActiveSessions().length === 0)
      retireCCSessionsOnCliChange()
      const next = send({ content: 'second', model: 'new-model' })
      await settle()
      expect(old.closed).toBe(false)
      expect(old.inputs).toHaveLength(1)
      expect(getCCActiveSessions()).toHaveLength(1)
      old.emit(completion)
      await next
      expect(old.closed).toBe(true)
      expect(drivers[1]?.inputs[0]?.message.content).toBe('second')
    })

  test('queued effort changes apply live, including max and returning to the default', async () => {
    await send({ effort: 'high' })
    const d = drivers[0]!
    const next = send({ effort: 'max', fastMode: true })
    await settle()
    expect(d.flags).toEqual([])
    d.emit(result)
    await next
    expect(drivers).toHaveLength(1)
    expect(d.flags).toEqual([{ effortLevel: 'max', fastMode: true }])
    expect(getCCDebugSnapshot().sessions[0]?.effort).toBe('max')
    d.emit(result)
    await send()
    expect(drivers).toHaveLength(1)
    expect(d.flags.at(-1)).toEqual({ effortLevel: null, fastMode: null })
    expect(getCCDebugSnapshot().sessions[0]?.effort).toBeUndefined()
    d.emit(result)
    await send()
    expect(d.flags).toHaveLength(2)
  })

  test('effort changes keep background jobs running and dispatch without waiting for them', async () => {
    await send({ effort: 'low' })
    const old = drivers[0]!
    old.emit({
      type: 'system',
      subtype: 'background_tasks_changed',
      tasks: [{ task_type: 'local_agent', task_id: 'bg', description: 'job' }]
    })
    old.emit(result)
    await until(() => getCCActiveSessions().length === 0)
    await send({ effort: 'high' })
    expect(old.closed).toBe(false)
    expect(drivers).toHaveLength(1)
    expect(old.inputs).toHaveLength(2)
    expect(old.flags).toEqual([{ effortLevel: 'high' }])
    expect(getCCDebugSnapshot().sessions[0]?.bgTasks).toBe(1)
  })

  test('snapshots replace missed task events and alone decide when CLI replacement is safe', async () => {
    await send()
    const old = drivers[0]!
    // A legacy edge may arrive before the first snapshot. That snapshot must
    // replace it, even when its task_started / task_notification never arrive.
    old.emit({
      type: 'system',
      subtype: 'task_started',
      task_type: 'local_bash',
      task_id: 'missed'
    })
    old.emit({
      type: 'system',
      subtype: 'background_tasks_changed',
      tasks: [{ task_type: 'local_agent', task_id: 'agent', description: 'job' }]
    })
    old.emit(result)
    await until(() => getCCActiveSessions().length === 0)
    expect(getCCDebugSnapshot().sessions[0]?.bgTasks).toBe(1)
    retireCCSessionsOnCliChange()
    const next = send({ content: 'second' })
    // The SDK does not guarantee ordering between snapshots and task events.
    old.emit({
      type: 'system',
      subtype: 'task_notification',
      task_id: 'agent',
      status: 'completed'
    })
    old.emit({
      type: 'system',
      subtype: 'task_updated',
      task_id: 'agent',
      patch: { status: 'killed' }
    })
    await settle()
    expect(old.closed).toBe(false)
    expect(old.inputs).toHaveLength(1)
    old.emit({ type: 'system', subtype: 'background_tasks_changed', tasks: [] })
    await next
    expect(old.closed).toBe(true)
    expect(drivers[1]?.inputs[0]?.message.content).toBe('second')
    expect(getCCDebugSnapshot().sessions[0]?.bgTasks).toBe(0)
  })

  test('an empty snapshot prevents late task edges from keeping a session alive', async () => {
    await send()
    const old = drivers[0]!
    old.emit({ type: 'system', subtype: 'background_tasks_changed', tasks: [] })
    old.emit({ type: 'system', subtype: 'task_started', task_type: 'local_bash', task_id: 'late' })
    old.emit({
      type: 'system',
      subtype: 'task_updated',
      task_id: 'late-agent',
      patch: { is_backgrounded: true }
    })
    old.emit(result)
    await until(() => getCCActiveSessions().length === 0)
    expect(getCCDebugSnapshot().sessions[0]?.bgTasks).toBe(0)
    retireCCSessionsOnCliChange()
    await send()
    expect(old.closed).toBe(true)
    // A new process starts tracking from empty, with the legacy fallback ready.
    const replacement = drivers[1]!
    replacement.emit({
      type: 'system',
      subtype: 'task_started',
      task_type: 'local_bash',
      task_id: 'new'
    })
    await until(() => getCCDebugSnapshot().sessions[0]?.bgTasks === 1)
  })

  test('ambient tasks retain their process without making the chat busy', async () => {
    await send()
    const old = drivers[0]!
    old.emit({
      type: 'system',
      subtype: 'background_tasks_changed',
      tasks: [{ task_type: 'local_bash', task_id: 'watcher', description: 'watch', ambient: true }]
    })
    old.emit(result)
    await until(() => getCCActiveSessions().length === 0)
    const next = send({ stream: true })
    await settle()
    expect(old.closed).toBe(false)
    expect(old.inputs).toHaveLength(1)
    old.emit({ type: 'system', subtype: 'background_tasks_changed', tasks: [] })
    await next
    expect(old.closed).toBe(true)
    expect(drivers[1]?.options.includePartialMessages).toBe(true)
  })

  for (const backgrounded of [
    {
      type: 'system',
      subtype: 'task_started',
      task_type: 'local_agent',
      task_id: 'agent',
      is_backgrounded: true
    },
    { type: 'system', subtype: 'task_updated', task_id: 'agent', patch: { is_backgrounded: true } }
  ])
    test(`legacy ${backgrounded.subtype} keeps backgrounded subagents alive`, async () => {
      await send()
      const old = drivers[0]!
      old.emit({
        type: 'system',
        subtype: 'task_started',
        task_type: 'local_agent',
        task_id: 'foreground',
        is_backgrounded: false
      })
      old.emit(result)
      await until(() => getCCActiveSessions().length === 0)
      expect(getCCDebugSnapshot().sessions[0]?.bgTasks).toBe(0)
      old.emit(backgrounded)
      await until(() => getCCDebugSnapshot().sessions[0]?.bgTasks === 1)
      retireCCSessionsOnCliChange()
      const next = send()
      await settle()
      expect(old.closed).toBe(false)
      old.emit({
        type: 'system',
        subtype: 'task_updated',
        task_id: 'agent',
        patch: { status: 'completed' }
      })
      await next
      expect(old.closed).toBe(true)
    })

  test('a rejected model fails visibly without submitting the prompt, then recovers', async () => {
    await send()
    const d = drivers[0]!
    d.emit(result)
    await until(() => getCCActiveSessions().length === 0)
    d.modelError = new Error('Unknown model')
    await expect(send({ model: 'unsupported' })).rejects.toThrow('Unknown model')
    expect(d.inputs).toHaveLength(1)
    expect(frames).toContainEqual({
      kind: 'error',
      sessionId: 'session-1',
      content: 'Unknown model'
    })
    await send({ content: 'valid follow-up' })
    expect(d.inputs).toHaveLength(2)
  })

  test('a rejected fast-mode setting does not send using the previous flags', async () => {
    await send()
    const d = drivers[0]!
    d.emit(result)
    await until(() => getCCActiveSessions().length === 0)
    d.flagError = new Error('Fast mode unavailable')
    await expect(send({ fastMode: true })).rejects.toThrow('Fast mode unavailable')
    expect(d.inputs).toHaveLength(1)
  })

  test('a rejected effort setting does not send or change tracked effort, then recovers', async () => {
    await send({ effort: 'low' })
    const d = drivers[0]!
    d.emit(result)
    await until(() => getCCActiveSessions().length === 0)
    d.flagError = new Error('Effort unavailable')
    await expect(send({ effort: 'max' })).rejects.toThrow('Effort unavailable')
    expect(d.inputs).toHaveLength(1)
    expect(getCCDebugSnapshot().sessions[0]?.effort).toBe('low')
    d.flagError = null
    await send({ effort: 'high' })
    expect(d.inputs).toHaveLength(2)
    expect(drivers).toHaveLength(1)
    expect(d.flags).toEqual([{ effortLevel: 'max' }, { effortLevel: 'high' }])
  })

  test('concurrent first sends share one subprocess', async () => {
    const first = send()
    const second = send({ content: 'second' })
    await first
    expect(drivers).toHaveLength(1)
    drivers[0]!.emit(result)
    await second
    expect(drivers).toHaveLength(1)
    expect(drivers[0]?.inputs).toHaveLength(2)
  })

  test('queued sends follow the real session id across a rename and CLI replacement', async () => {
    await send({ sessionId: 'temp-id', isNew: true })
    const old = drivers[0]!
    const second = send({ sessionId: 'temp-id', isNew: true, content: 'second' })
    old.emit({ type: 'system', subtype: 'init', session_id: 'real-id', model: 'old-model' })
    await until(() => getCCDebugSnapshot().sessions[0]?.sessionId === 'real-id')
    retireCCSessionsOnCliChange()
    old.emit(result)
    await second
    expect(drivers[1]?.options.resume).toBe('real-id')
    expect(drivers[1]?.inputs[0]?.message.content).toBe('second')
  })

  test('Stop cancels queued sends and waits for the interrupted result before another send', async () => {
    await send()
    const d = drivers[0]!
    const queued = send({ content: 'cancel me' })
    const stopped = interruptCCSession(input.workspaceId, input.sessionId)
    await expect(queued).rejects.toThrow('cancelled')
    const next = send({ content: 'after Stop' })
    await settle()
    expect(d.inputs).toHaveLength(1)
    d.emit(result)
    await stopped
    await next
    expect(d.inputs.map(m => m.message.content)).toEqual(['first', 'after Stop'])
  })

  test('Stop during async setup prevents a late subprocess from being created', async () => {
    const gate = Promise.withResolvers<Record<string, string>>()
    const spy = spyOn(workspaceEnv, 'resolveWorkspaceEnv').mockReturnValue(gate.promise)
    const first = send()
    await interruptCCSession(input.workspaceId, input.sessionId)
    gate.resolve({})
    await expect(first).rejects.toThrow('cancelled')
    await settle()
    expect(drivers).toHaveLength(0)
    spy.mockRestore()
  })

  test('a CLI change during a setter round-trip retries before sending', async () => {
    await send()
    const old = drivers[0]!
    old.emit(result)
    await until(() => getCCActiveSessions().length === 0)
    const gate = Promise.withResolvers<void>()
    old.beforeModel = () => gate.promise
    const next = send({ model: 'other-model', content: 'second' })
    await until(() => old.models.length === 1)
    retireCCSessionsOnCliChange()
    gate.resolve()
    await next
    expect(old.inputs).toHaveLength(1)
    expect(drivers[1]?.inputs[0]?.message.content).toBe('second')
  })

  test('a rejected setter on a newly stale CLI retries on the replacement', async () => {
    await send()
    const old = drivers[0]!
    old.emit(result)
    await until(() => getCCActiveSessions().length === 0)
    const gate = Promise.withResolvers<void>()
    old.beforeModel = () => gate.promise
    old.modelError = new Error('Unknown model on old CLI')
    const next = send({ model: 'new-model' })
    await until(() => old.models.length === 1)
    retireCCSessionsOnCliChange()
    gate.resolve()
    await next
    expect(old.inputs).toHaveLength(1)
    expect(drivers[1]?.options.model).toBe('new-model')
  })

  test('Stop during a model change never submits the cancelled prompt', async () => {
    await send()
    const d = drivers[0]!
    d.emit(result)
    await until(() => getCCActiveSessions().length === 0)
    const gate = Promise.withResolvers<void>()
    d.beforeModel = () => gate.promise
    const cancelled = send({ model: 'other-model' })
    await until(() => d.models.length === 1)
    await interruptCCSession(input.workspaceId, input.sessionId)
    gate.resolve()
    await expect(cancelled).rejects.toThrow('cancelled')
    await settle()
    expect(d.inputs).toHaveLength(1)
    await send({ content: 'use the original model' })
    expect(d.models).toEqual(['other-model', 'old-model'])
    expect(d.inputs).toHaveLength(2)
  })

  test('Stop during a flag change preserves acknowledged values for the next send to reset', async () => {
    await send({ effort: 'low' })
    const d = drivers[0]!
    d.emit(result)
    await until(() => getCCActiveSessions().length === 0)
    const gate = Promise.withResolvers<void>()
    d.beforeFlags = () => gate.promise
    const cancelled = send({ effort: 'max', fastMode: true })
    await until(() => d.flags.length === 1)
    await interruptCCSession(input.workspaceId, input.sessionId)
    gate.resolve()
    await expect(cancelled).rejects.toThrow('cancelled')
    await settle()
    expect(d.inputs).toHaveLength(1)
    await send({ effort: 'low' })
    expect(drivers).toHaveLength(1)
    expect(d.flags).toEqual([
      { effortLevel: 'max', fastMode: true },
      { effortLevel: 'low', fastMode: null }
    ])
    expect(d.inputs).toHaveLength(2)
  })

  test('a rejected effort change on a newly stale CLI retries with the requested settings', async () => {
    await send({ effort: 'low' })
    const old = drivers[0]!
    old.emit(result)
    await until(() => getCCActiveSessions().length === 0)
    const gate = Promise.withResolvers<void>()
    old.beforeFlags = () => gate.promise
    old.flagError = new Error('Effort unavailable on old CLI')
    const next = send({ effort: 'max' })
    await until(() => old.flags.length === 1)
    retireCCSessionsOnCliChange()
    gate.resolve()
    await next
    expect(old.inputs).toHaveLength(1)
    expect(drivers[1]?.options.effort).toBe('max')
  })

  test('an unexpected subprocess exit rejects queued messages and clears activity', async () => {
    await send()
    const queued = send({ content: 'second' })
    drivers[0]!.close()
    await expect(queued).rejects.toThrow('session closed')
    await until(() => getCCActiveSessions().length === 0)
    expect(frames).toContainEqual({
      kind: 'error',
      sessionId: 'session-1',
      content: 'Agent session closed before queued messages were sent'
    })
    await send({ content: 'try again' })
    expect(drivers).toHaveLength(2)
  })

  test('an idle bookkeeping callback cannot settle a newly dispatched message', async () => {
    await send()
    const d = drivers[0]!
    d.emit(result)
    await until(() => getCCActiveSessions().length === 0)
    const gate = Promise.withResolvers<null>()
    const spy = spyOn(viewBuilders, 'markViewBuilderWaitingBySession').mockReturnValue(gate.promise)
    // A repeated idle event starts async bookkeeping while the queue is empty.
    d.emit({ type: 'system', subtype: 'session_state_changed', state: 'idle' })
    await settle()
    await send({ content: 'second' })
    gate.resolve(null)
    await settle()
    const third = send({ content: 'third' })
    await settle()
    expect(d.inputs).toHaveLength(2)
    spy.mockRestore()
    d.emit(result)
    d.emit({ type: 'system', subtype: 'session_state_changed', state: 'idle' })
    await third
    expect(d.inputs).toHaveLength(3)
  })

  test('state events wait for turn completion and cannot release a startup send', async () => {
    await send()
    const d = drivers[0]!
    const second = send({ content: 'second' })
    d.emit({ type: 'system', subtype: 'session_state_changed', state: 'idle' })
    await settle()
    expect(d.inputs).toHaveLength(1)
    d.emit(result)
    await settle()
    expect(d.inputs).toHaveLength(1)
    d.emit({ type: 'system', subtype: 'session_state_changed', state: 'idle' })
    await second
    expect(d.inputs).toHaveLength(2)
  })

  test('a background result does not release a user prompt still queued inside the CLI', async () => {
    await send()
    const d = drivers[0]!
    const second = send({ content: 'second' })
    retireCCSessionsOnCliChange()
    d.emit({ ...result, queued_turn_count: 1 })
    await settle()
    expect(d.closed).toBe(false)
    d.emit({ ...result, user_message_uuid: 'background-turn' })
    await settle()
    expect(d.closed).toBe(false)
    d.emit({ ...result, user_message_uuids: [d.inputs[0]!.uuid] })
    await second
    expect(d.closed).toBe(true)
    expect(drivers[1]?.inputs[0]?.message.content).toBe('second')
  })

  test('Stop times out if the CLI acknowledges without ever finishing its turn', async () => {
    await send()
    const old = drivers[0]!
    await interruptCCSession(input.workspaceId, input.sessionId)
    expect(old.closed).toBe(true)
    expect(getCCActiveSessions()).toHaveLength(0)
    await send({ content: 'recover' })
    expect(drivers).toHaveLength(2)
  }, 7000)
})
