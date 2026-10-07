import { afterEach, beforeEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { WorkspaceEntry } from '@/lib/types'
import { renderMoiContext } from '@/lib/moi-context'
import { allHarnesses, harnessFor } from './harness/registry'
import type { SendMessageInput } from './harness/types'
import { ForkUnsupportedError } from './harness/fork'
import {
  createViewFromSession,
  submitView,
  sendWorkspaceMessage,
  failInterruptedViewStarts
} from './view-sessions'
import {
  createPendingView,
  getPendingView,
  listPendingViews,
  setPendingViewStorePath,
  updatePendingView,
  completeViewBuild,
  discardPendingView,
  beginViewBuild
} from './pending-views'
import {
  getSessionRecord,
  patchSessionRecord,
  setSessionStorePath,
  DEFAULT_SESSION_STORE_PATH
} from './session-store'
import {
  getSelectedSession,
  getPinnedSession,
  pinSession,
  saveSelectedSession,
  setSelectedSessionPath,
  DEFAULT_SELECTED_SESSION_PATH
} from './selected-session'
import { renameSessionReferences } from './session-lifecycle'
import { getSessionConfig, saveSessionConfig } from './session-config'
import { DATA_DIR } from './data-dir'
import { setEventServer } from './events'
import { getClientFrameLog } from './harness/debug'
const harness = harnessFor('codex')
const original = {
  forkSession: harness.forkSession,
  sendMessage: harness.sendMessage,
  listSessions: harness.listSessions,
  sessionEvents: harness.sessionEvents,
  activeSessions: harness.activeSessions,
  interrupt: harness.interrupt,
  archiveSession: harness.archiveSession
}
let dir: string
let ws: WorkspaceEntry
let sent: SendMessageInput[]
let events: unknown[]
let forks: number
let archived: string[]
let stopped: string[]
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'moi-view-sessions-'))
  ws = { id: 'test', path: dir, type: 'codex', addedAt: '' }
  setPendingViewStorePath(join(dir, 'pending-views.json'))
  setSessionStorePath(join(dir, 'sessions.json'))
  setSelectedSessionPath(join(dir, 'selection.json'))
  sent = []
  events = []
  forks = 0
  archived = []
  stopped = []
  harness.interrupt = async (_, sessionId) => {
    stopped.push(sessionId)
  }
  harness.archiveSession = async (_, sessionId) => {
    expect(stopped).toContain(sessionId)
    archived.push(sessionId)
  }
  setEventServer({ publish: (_topic, text) => events.push(JSON.parse(text)) })
  harness.listSessions = async () => [{ sessionId: 'source', summary: 'Source', lastModified: 1 }]
  harness.activeSessions = () => [{ workspaceId: ws.id, sessionId: 'source', activity: 'running' }]
  harness.forkSession = async () => {
    forks++
    return 'child'
  }
  harness.sessionEvents = async () => [
    {
      kind: 'turn',
      turn: {
        id: 'boundary',
        role: 'user',
        origin: { kind: 'user-input' },
        parts: [{ type: 'text', text: 'Background' }],
        timestamp: '2026-09-18T00:00:00Z'
      }
    }
  ]
  harness.sendMessage = async input => {
    sent.push(input)
  }
})
afterEach(async () => {
  Object.assign(harness, original)
  setPendingViewStorePath(join(DATA_DIR, 'pending-views.json'))
  setSessionStorePath(DEFAULT_SESSION_STORE_PATH)
  setSelectedSessionPath(DEFAULT_SELECTED_SESSION_PATH)
  setEventServer({ publish: () => {} })
  await rm(dir, { recursive: true, force: true })
})
test('manual creation has no session until submission, then attaches once', async () => {
  const view = await createPendingView(ws.id, ws.path)
  expect(view.executionSessionId).toBeUndefined()
  expect(await getSelectedSession(ws.path, `views/${view.id}`)).toBeUndefined()
  const result = await submitView(ws, view.id, { requirements: 'Build cards', sessionId: 'fresh' })
  expect(result).toEqual({ viewId: view.id, sessionId: 'fresh' })
  expect(await getSessionRecord(ws.path, 'fresh')).toEqual({ tabId: `views/${view.id}` })
  expect(sent[0]).toMatchObject({ sessionId: 'fresh', isNew: true, content: 'Build cards' })
  expect(renderMoiContext(sent[0].context!)).toContain('Build a new view from this message.')
  expect(renderMoiContext(sent[0].context!)).toContain('moi views create --requirements')
  expect(sent[0].context?.activeTab).toBeUndefined()
  expect(sent[0].context?.chatTab).toEqual({ id: `views/${view.id}` })
  expect(sent[0]).not.toHaveProperty('viewBuildId')
  expect((await getPendingView(ws.path, view.id))?.status).toBe('submitted')
})
test('CLI prepares a fork and boundary before creating a view while source stays running', async () => {
  harness.forkSession = async () => {
    forks++
    expect(await listPendingViews(ws.path)).toEqual([])
    return 'child'
  }
  harness.sessionEvents = async () => {
    expect(await getSessionRecord(ws.path, 'child')).toEqual({ forkedFromSessionId: 'source' })
    expect(await listPendingViews(ws.path)).toEqual([])
    return []
  }
  harness.sendMessage = async input => {
    expect(await getSessionRecord(ws.path, 'child')).toMatchObject({
      tabId: input.context?.chatTab?.id
    })
    expect((await getSessionRecord(ws.path, 'child')).forkedThroughMessageId).toBeUndefined()
    sent.push(input)
  }
  const result = await createViewFromSession(ws, 'source', 'Build cards')
  expect(result).toEqual({ viewId: expect.any(String), mode: 'handoff', sessionId: 'child' })
  expect(result).not.toHaveProperty('url')
  expect(sent).toHaveLength(1)
  expect(sent[0].isNew).toBe(false)
  expect(renderMoiContext(sent[0].context!)).toContain('Build a new view from this message.')
  expect(sent[0].context?.chatTab).toEqual({ id: `views/${result.viewId}` })
  expect(sent[0].context?.activeTab).toBeUndefined()
  expect(renderMoiContext(sent[0].context!)).toContain('moi views create --requirements')
  expect(renderMoiContext(sent[0].context!)).not.toContain('--from-session')
  expect(renderMoiContext(sent[0].context!)).toContain('Inherited conversation is background.')
  await sendWorkspaceMessage(ws, {
    workspaceId: ws.id,
    workspacePath: ws.path,
    sessionId: 'child',
    isNew: false,
    content: 'Make the cards smaller',
    context: { activeTab: { id: `views/${result.viewId}` } }
  })
  expect(renderMoiContext(sent[1].context!)).not.toContain('Inherited conversation is background.')
  expect(renderMoiContext(sent[1].context!)).not.toContain('moi views create')
  expect(forks).toBe(1)
  expect(events).not.toContainEqual(expect.objectContaining({ type: 'tab:focus' }))
})
test('handoff waits for send acceptance', async () => {
  const gate = Promise.withResolvers<void>()
  harness.sendMessage = async input => {
    sent.push(input)
    await gate.promise
  }
  let completed = false
  const request = createViewFromSession(ws, 'source', 'Build cards').then(result => {
    completed = true
    return result
  })
  while (!sent.length) await Bun.sleep(1)
  expect(completed).toBe(false)
  gate.resolve()
  await request
  expect(completed).toBe(true)
})
test.each(['manual', 'cli'])(
  'pinned %s build preserves ownership and leaves the view selection empty',
  async entry => {
    await patchSessionRecord(ws.path, 'source', { tabId: 'views/original' })
    await saveSelectedSession(ws.path, 'source', undefined, 'views/original')
    await pinSession(ws.path, 'source')
    const result =
      entry === 'cli'
        ? await createViewFromSession(ws, undefined, 'Build cards')
        : await submitView(ws, (await createPendingView(ws.id, ws.path)).id, {
            requirements: 'Build cards'
          })
    expect(forks).toBe(0)
    expect(sent).toHaveLength(entry === 'cli' ? 0 : 1)
    expect(await getSessionRecord(ws.path, 'source')).toEqual({ tabId: 'views/original' })
    expect(await getSelectedSession(ws.path, `views/${result.viewId}`)).toBeUndefined()
    if (entry === 'cli') {
      expect(result).toMatchObject({
        mode: 'in-place',
        buildInstructions: expect.arrayContaining([
          expect.stringContaining(`.moi/views/${result.viewId}.tsx`),
          expect.stringContaining('moi views create --requirements')
        ])
      })
    } else {
      expect(sent[0].isNew).toBe(false)
      expect(sent[0].context?.chatTab).toEqual({ id: 'views/original' })
      expect(sent[0].context?.activeTab).toBeUndefined()
      expect(renderMoiContext(sent[0].context!)).toContain('Build a new view from this message.')
      expect(renderMoiContext(sent[0].context!)).toContain('moi views create --requirements')
    }
    await pinSession(ws.path, null)
    await sendWorkspaceMessage(ws, {
      workspaceId: ws.id,
      workspacePath: ws.path,
      sessionId: 'new-chat',
      isNew: true,
      content: 'Continue',
      context: { activeTab: { id: `views/${result.viewId}` } }
    })
    expect(await getSessionRecord(ws.path, 'new-chat')).toEqual({ tabId: `views/${result.viewId}` })
    expect(renderMoiContext(sent.at(-1)!.context!)).toContain(
      `The view id is \`${result.viewId}\`.`
    )
  }
)
test.each([false, true])(
  'CLI creation without a source creates only a view (pinned: %s)',
  async pinned => {
    await patchSessionRecord(ws.path, 'source', { tabId: 'scratchpad' })
    if (pinned) await pinSession(ws.path, 'source')
    harness.listSessions = async () => {
      throw new Error('Should not look up chats')
    }
    harness.activeSessions = () => {
      throw new Error('Should not look up chats')
    }
    const result = await createViewFromSession(ws, undefined, '  Build cards  ')
    expect(result.mode).toBe('in-place')
    const instructions = result.buildInstructions?.join('\n')
    expect(instructions).toContain('moi views create --requirements')
    expect(instructions).not.toContain('--from-session')
    const view = await getPendingView(ws.path, result.viewId)
    expect(view).toMatchObject({ requirements: 'Build cards', status: 'submitted' })
    expect(view?.executionSessionId).toBeUndefined()
    expect(await getSessionRecord(ws.path, 'source')).toEqual({ tabId: 'scratchpad' })
    expect(await getSessionRecord(ws.path, 'child')).toEqual({})
    expect(await getPinnedSession(ws.path)).toBe(pinned ? 'source' : null)
    expect(await getSelectedSession(ws.path, `views/${result.viewId}`)).toBeUndefined()
    expect(forks).toBe(0)
    expect(sent).toEqual([])
  }
)
test('CLI creation rejects an empty explicit source', async () => {
  await expect(createViewFromSession(ws, '', 'Build cards')).rejects.toThrow(
    'Session id cannot be empty'
  )
  expect(await listPendingViews(ws.path)).toEqual([])
  expect(forks).toBe(0)
  expect(sent).toEqual([])
})
test('CLI creation forks the explicit source even when a different chat is pinned', async () => {
  await pinSession(ws.path, 'source')
  harness.listSessions = async () => [{ sessionId: 'other', summary: 'Other', lastModified: 1 }]
  harness.forkSession = async (_ws, sourceId) => {
    expect(sourceId).toBe('other')
    forks++
    return 'child'
  }
  const result = await createViewFromSession(ws, 'other', 'Build cards')
  expect(result).toEqual({ viewId: expect.any(String), mode: 'handoff', sessionId: 'child' })
  expect(await getSessionRecord(ws.path, 'child')).toMatchObject({
    tabId: `views/${result.viewId}`,
    forkedFromSessionId: 'other'
  })
  expect(await getSelectedSession(ws.path, `views/${result.viewId}`)).toBe('child')
  expect(await getPinnedSession(ws.path)).toBe('source')
  expect(forks).toBe(1)
  expect(sent).toHaveLength(1)
})
test('CLI creation rejects an unknown explicit source before creating a view', async () => {
  await expect(createViewFromSession(ws, 'missing', 'Build cards')).rejects.toThrow(
    'Source chat not found'
  )
  expect(await listPendingViews(ws.path)).toEqual([])
  expect(forks).toBe(0)
  expect(sent).toEqual([])
})
test('CLI creation still requires nonempty requirements in a pinned chat', async () => {
  await pinSession(ws.path, 'source')
  await expect(createViewFromSession(ws, undefined, '  ')).rejects.toThrow(
    'View requirements are required'
  )
  expect(await listPendingViews(ws.path)).toEqual([])
})
test.each(['missing', 'unsupported'])('fresh fallback for %s fork support', async kind => {
  harness.forkSession =
    kind === 'missing'
      ? undefined
      : async () => {
          throw new ForkUnsupportedError()
        }
  const result = await createViewFromSession(ws, 'source', 'Build cards')
  expect(await getSessionRecord(ws.path, result.sessionId!)).toEqual({
    tabId: `views/${result.viewId}`
  })
  expect(sent[0].isNew).toBe(true)
})
test('uncertain fork failure does not create a view or retry', async () => {
  harness.forkSession = async () => {
    forks++
    throw new Error('Connection lost')
  }
  await expect(createViewFromSession(ws, 'source', 'Build cards')).rejects.toThrow(
    'Connection lost'
  )
  expect(forks).toBe(1)
  expect(await listPendingViews(ws.path)).toEqual([])
  expect(sent).toEqual([])
})
test('boundary read failure keeps the fork and continues with full history', async () => {
  harness.sessionEvents = async () => {
    throw new Error('History unavailable')
  }
  const result = await createViewFromSession(ws, 'source', 'Build cards')
  expect(result).toEqual({ viewId: expect.any(String), mode: 'handoff', sessionId: 'child' })
  expect(await getSessionRecord(ws.path, 'child')).toEqual({
    forkedFromSessionId: 'source',
    tabId: `views/${result.viewId}`
  })
  expect(sent[0]?.content).toBe('Build cards')
  await sendWorkspaceMessage(ws, {
    workspaceId: ws.id,
    workspacePath: ws.path,
    sessionId: 'child',
    isNew: false,
    content: 'Continue'
  })
  expect(sent.at(-1)?.content).toBe('Continue')
})
test('send failure retains view and child and reports both IDs', async () => {
  harness.sendMessage = async () => {
    throw new Error('Send failed')
  }
  await expect(createViewFromSession(ws, 'source', 'Build cards')).rejects.toMatchObject({
    sessionId: 'child',
    viewId: expect.any(String)
  })
  const [view] = await listPendingViews(ws.path)
  expect(view).toMatchObject({ status: 'failed', executionSessionId: 'child' })
  await failInterruptedViewStarts(ws)
  expect(forks).toBe(1)
})
test('completion removes build state without moving selection, ownership, or pin', async () => {
  const result = await createViewFromSession(ws, 'source', 'Build cards')
  await pinSession(ws.path, 'source')
  await completeViewBuild(ws.id, ws.path, result.viewId)
  await completeViewBuild(ws.id, ws.path, result.viewId)
  expect(await listPendingViews(ws.path)).toEqual([])
  expect(await getSelectedSession(ws.path, `views/${result.viewId}`)).toBe('child')
  expect(await getSessionRecord(ws.path, 'child')).toMatchObject({
    tabId: `views/${result.viewId}`,
    forkedThroughMessageId: 'boundary'
  })
  expect(await getPinnedSession(ws.path)).toBe('source')
})
test('late send acceptance does not recreate a completed build', async () => {
  harness.sendMessage = async input => {
    await completeViewBuild(ws.id, ws.path, input.context!.chatTab!.id.slice('views/'.length))
  }
  await createViewFromSession(ws, 'source', 'Build cards')
  expect(await listPendingViews(ws.path)).toEqual([])
})
test('native rename preserves the execution reference and attached selection', async () => {
  harness.sendMessage = async input => {
    await renameSessionReferences(ws.id, ws.path, input.sessionId, 'native')
  }
  const result = await createViewFromSession(ws, 'source', 'Build cards')
  expect(result.sessionId).toBe('native')
  expect((await getPendingView(ws.path, result.viewId))?.executionSessionId).toBe('native')
  expect(await getSelectedSession(ws.path, `views/${result.viewId}`)).toBe('native')
})
test.each(allHarnesses().map(harness => harness.id))(
  '%s handoff inherits source settings through native fork or fresh fallback',
  async type => {
    const target = harnessFor(type)
    const original = {
      forkSession: target.forkSession,
      sendMessage: target.sendMessage,
      listSessions: target.listSessions,
      sessionEvents: target.sessionEvents,
      activeSessions: target.activeSessions
    }
    const config = { model: 'model', effort: 'high', fastMode: false }
    const workspace = { ...ws, type, agentId: 'agent' }
    await saveSessionConfig(ws.path, 'source', config)
    target.listSessions = harness.listSessions
    target.activeSessions = harness.activeSessions
    target.sessionEvents = async () => []
    target.sendMessage = async input => {
      expect(await getSessionConfig(ws.path, input.sessionId)).toEqual(config)
      sent.push(input)
    }
    target.forkSession = original.forkSession
      ? async (_ws, sourceId, sourceConfig) => {
          expect(sourceId).toBe('source')
          expect(sourceConfig).toEqual(config)
          // A later source edit must not change the settings of this fork.
          await saveSessionConfig(ws.path, sourceId, { model: 'other', effort: 'low' })
          return 'child'
        }
      : undefined
    try {
      const result = await createViewFromSession(workspace, 'source', 'Build cards')
      expect(await getSessionConfig(ws.path, result.sessionId!)).toEqual(config)
      expect(sent).toHaveLength(1)
      expect(sent[0]).toMatchObject({ ...config, isNew: !original.forkSession })
    } finally {
      Object.assign(target, original)
    }
  }
)
test('restart fails a starting view without forking or sending', async () => {
  const view = await createPendingView(ws.id, ws.path, {
    status: 'starting',
    executionSessionId: 'child'
  })
  await failInterruptedViewStarts(ws)
  expect((await getPendingView(ws.path, view.id))?.status).toBe('failed')
  expect(sent).toEqual([])
  expect(forks).toBe(0)
})
test('metadata updates neither create views nor change status', async () => {
  await expect(updatePendingView(ws.id, ws.path, 'missing', { title: 'Cards' })).rejects.toThrow(
    'not found'
  )
  const view = await createPendingView(ws.id, ws.path)
  const updated = await updatePendingView(ws.id, ws.path, view.id, { title: 'Cards', icon: 'book' })
  expect(updated).toMatchObject({ title: 'Cards', icon: 'book', status: 'draft' })
})
test('duplicate submissions are rejected', async () => {
  const view = await createPendingView(ws.id, ws.path)
  const results = await Promise.allSettled([
    submitView(ws, view.id, { requirements: 'Cards' }),
    submitView(ws, view.id, { requirements: 'Cards' })
  ])
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
  expect(sent).toHaveLength(1)
})
test('discard blocks startup and active construction, then archives attributed chats', async () => {
  const view = await createPendingView(ws.id, ws.path)
  await beginViewBuild(ws.id, ws.path, view.id, 'Cards', 'child', false)
  await expect(discardPendingView(ws, view.id, new Set())).rejects.toThrow('only be closed')
  await failInterruptedViewStarts(ws)
  await patchSessionRecord(ws.path, 'child', {
    tabId: `views/${view.id}`,
    forkedFromSessionId: 'source'
  })
  await expect(discardPendingView(ws, view.id, new Set(['child']))).rejects.toThrow(
    'only be closed'
  )
  expect(archived).toEqual([])
  await patchSessionRecord(ws.path, 'follow-up', { tabId: `views/${view.id}` })
  await saveSelectedSession(ws.path, 'child', undefined, `views/${view.id}`)
  await saveSelectedSession(ws.path, 'child')
  await pinSession(ws.path, 'follow-up')
  await discardPendingView(ws, view.id, new Set())
  expect(archived).toEqual(['child', 'follow-up'])
  expect(await getPendingView(ws.path, view.id)).toBeUndefined()
  expect(await getSessionRecord(ws.path, 'child')).toEqual({
    tabId: `views/${view.id}`,
    forkedFromSessionId: 'source'
  })
  expect(await getSelectedSession(ws.path, `views/${view.id}`)).toBeUndefined()
  expect(await getSelectedSession(ws.path)).toBeUndefined()
  expect(await getPinnedSession(ws.path)).toBeNull()
  expect(getClientFrameLog(ws.id).map(entry => entry.frame)).toEqual(
    expect.arrayContaining(
      archived.map(sessionId => ({
        type: 'session_archived',
        workspaceId: ws.id,
        sessionId
      }))
    )
  )
})

test('discard archives view attribution rather than a pinned execution chat', async () => {
  const view = await createPendingView(ws.id, ws.path, {
    status: 'submitted',
    executionSessionId: 'source'
  })
  await patchSessionRecord(ws.path, 'source', { tabId: 'scratchpad' })
  await patchSessionRecord(ws.path, 'sibling', { tabId: 'views/sibling' })
  await patchSessionRecord(ws.path, 'owned', { tabId: `views/${view.id}` })
  await pinSession(ws.path, 'source')
  await saveSelectedSession(ws.path, 'source', undefined, `views/${view.id}`)
  await saveSelectedSession(ws.path, 'source', undefined, 'scratchpad')
  await discardPendingView(ws, view.id, new Set())
  expect(archived).toEqual(['owned'])
  expect(await getPinnedSession(ws.path)).toBe('source')
  expect(await getSelectedSession(ws.path, 'scratchpad')).toBe('source')
  expect(await getSelectedSession(ws.path, `views/${view.id}`)).toBeUndefined()
  expect(await getSessionRecord(ws.path, 'source')).toEqual({ tabId: 'scratchpad' })
})

test('archive failure leaves a pending view and its selection available to retry', async () => {
  const view = await createPendingView(ws.id, ws.path, {
    status: 'failed',
    executionSessionId: 'child'
  })
  await patchSessionRecord(ws.path, 'child', { tabId: `views/${view.id}` })
  await saveSelectedSession(ws.path, 'child', undefined, `views/${view.id}`)
  harness.archiveSession = async () => {
    throw new Error('Archive failed')
  }
  await expect(discardPendingView(ws, view.id, new Set())).rejects.toThrow('Archive failed')
  expect(await getPendingView(ws.path, view.id)).toEqual(view)
  expect(await getSelectedSession(ws.path, `views/${view.id}`)).toBe('child')
  harness.archiveSession = async (_, sessionId) => {
    archived.push(sessionId)
  }
  await discardPendingView(ws, view.id, new Set())
  expect(archived).toEqual(['child'])
  expect(await getPendingView(ws.path, view.id)).toBeUndefined()
})

test('fresh handoff failure reports the provider ID after a native rename', async () => {
  harness.forkSession = undefined
  harness.sendMessage = async input => {
    await renameSessionReferences(ws.id, ws.path, input.sessionId, 'native-child')
    throw new Error('Send rejected')
  }
  await expect(createViewFromSession(ws, 'source', 'Cards')).rejects.toMatchObject({
    sessionId: 'native-child',
    viewId: expect.any(String)
  })
  expect((await listPendingViews(ws.path))[0]).toMatchObject({
    status: 'failed',
    executionSessionId: 'native-child'
  })
})

test('a fresh chat after unpinning receives the saved view requirements', async () => {
  const view = await createPendingView(ws.id, ws.path, {
    requirements: 'Build a gardening board with watering reminders',
    status: 'submitted',
    executionSessionId: 'source'
  })
  await sendWorkspaceMessage(ws, {
    workspaceId: ws.id,
    workspacePath: ws.path,
    sessionId: 'fresh',
    isNew: true,
    content: 'Continue',
    context: { activeTab: { id: `views/${view.id}` } }
  })
  expect(sent[0].context?.directives).toContain(
    'Original view requirements:\nBuild a gardening board with watering reminders'
  )
  expect(await getSessionRecord(ws.path, 'fresh')).toEqual({ tabId: `views/${view.id}` })
})

test('follow-ups keep chat context without repeating the build request, including off the view tab', async () => {
  const view = await createPendingView(ws.id, ws.path)
  await submitView(ws, view.id, { requirements: 'Build cards', sessionId: 'fresh' })
  for (const activeTab of [`views/${view.id}`, 'overview'] as const) {
    await sendWorkspaceMessage(ws, {
      workspaceId: ws.id,
      workspacePath: ws.path,
      sessionId: 'fresh',
      isNew: false,
      content: 'Make the cards smaller',
      context: { activeTab: { id: activeTab }, directives: ['Use compact spacing.'] }
    })
    const context = sent.at(-1)!.context!
    expect(context.chatTab).toEqual({ id: `views/${view.id}` })
    expect(context.activeTab).toEqual({ id: activeTab })
    const rendered = renderMoiContext(context)
    expect(rendered).not.toContain('Build a new view from this message.')
    expect(rendered).not.toContain('moi views set')
    expect(rendered).not.toContain('Available view icons')
    expect(rendered).toContain('# Chat tab')
    expect(context).not.toHaveProperty('chat')
    expect(rendered).not.toContain('pinned')
    expect(rendered).not.toContain('moi views create')
    expect(rendered).toContain('# This message only\nUse compact spacing.')
  }
})

test('ordinary sends preserve the visible tab snapshot and resolve the chat tab separately', async () => {
  await patchSessionRecord(ws.path, 'source', { tabId: 'views/original' })
  const activeTab = { id: 'views/current', title: 'Current view', params: { item: '42' } } as const
  await sendWorkspaceMessage(ws, {
    workspaceId: ws.id,
    workspacePath: ws.path,
    sessionId: 'source',
    isNew: false,
    content: 'Explain this item',
    context: { activeTab, chatTab: { id: 'views/forged' } }
  })
  expect(sent[0].context?.activeTab).toEqual(activeTab)
  expect(sent[0].context?.chatTab).toEqual({ id: 'views/original' })
  expect(renderMoiContext(sent[0].context!)).toContain('The user is on the "Current view" view tab')
  expect(renderMoiContext(sent[0].context!)).toContain(
    'This chat belongs to the "original" view tab'
  )
  expect(await getPinnedSession(ws.path)).toBeNull()
  expect(await getSessionRecord(ws.path, 'source')).toEqual({ tabId: 'views/original' })
})

test('a new browser chat groups the visible view title and params without attaching params to the chat', async () => {
  const activeTab = { id: 'views/garden', title: 'Garden', params: { plant: 'rose' } } as const
  await sendWorkspaceMessage(ws, {
    workspaceId: ws.id,
    workspacePath: ws.path,
    sessionId: 'fresh',
    isNew: true,
    content: 'Explain this plant',
    context: { activeTab }
  })
  expect(sent[0].context?.activeTab).toEqual(activeTab)
  expect(sent[0].context?.chatTab).toEqual({ id: 'views/garden', title: 'Garden' })
  expect(await getSessionRecord(ws.path, 'fresh')).toEqual({ tabId: 'views/garden' })
})

test('completion keeps the attached chat context without repeating build instructions', async () => {
  const view = await createPendingView(ws.id, ws.path)
  await submitView(ws, view.id, { requirements: 'Build cards', sessionId: 'fresh' })
  await completeViewBuild(ws.id, ws.path, view.id)
  await sendWorkspaceMessage(ws, {
    workspaceId: ws.id,
    workspacePath: ws.path,
    sessionId: 'fresh',
    isNew: false,
    content: 'What do you think?',
    context: { activeTab: { id: 'overview' } }
  })
  expect(sent.at(-1)?.context?.chatTab).toEqual({ id: `views/${view.id}` })
  expect(renderMoiContext(sent.at(-1)!.context!)).not.toContain(
    'Build a new view from this message.'
  )
})

test('a pinned chat receives one build request per view, with no repeats on follow-ups', async () => {
  await pinSession(ws.path, 'source')
  for (const requirements of ['Build cards', 'Build a calendar']) {
    const view = await createPendingView(ws.id, ws.path)
    await submitView(ws, view.id, { requirements })
    expect(renderMoiContext(sent.at(-1)!.context!)).toContain(`The view id is \`${view.id}\`.`)
    expect(renderMoiContext(sent.at(-1)!.context!)).toContain('moi views create --requirements')
    await sendWorkspaceMessage(ws, {
      workspaceId: ws.id,
      workspacePath: ws.path,
      sessionId: 'source',
      isNew: false,
      content: 'Continue',
      context: { activeTab: { id: `views/${view.id}` } }
    })
    const rendered = renderMoiContext(sent.at(-1)!.context!)
    expect(rendered).not.toContain('Build a new view from this message.')
    expect(rendered).not.toContain('moi views create')
    expect(rendered).not.toContain('pinned')
    expect(sent.at(-1)?.context?.chatTab).toBeUndefined()
    expect(rendered).not.toContain('start it in its own chat')
  }
})

test('rejected ordinary sends do not mark a pending view submitted', async () => {
  const view = await createPendingView(ws.id, ws.path, { requirements: 'Cards' })
  harness.sendMessage = async () => {
    throw new Error('Unavailable')
  }
  await expect(
    sendWorkspaceMessage(ws, {
      workspaceId: ws.id,
      workspacePath: ws.path,
      sessionId: 'fresh',
      isNew: true,
      content: 'Continue',
      context: { activeTab: { id: `views/${view.id}` } }
    })
  ).rejects.toThrow('Unavailable')
  expect((await getPendingView(ws.path, view.id))?.status).toBe('draft')
})
