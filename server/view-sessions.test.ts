import { afterEach, beforeEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { WorkspaceEntry } from '@/lib/types'
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
      tabId: input.context?.activeTab
    })
    expect((await getSessionRecord(ws.path, 'child')).forkedThroughMessageId).toBeUndefined()
    sent.push(input)
  }
  const result = await createViewFromSession(ws, 'source', 'Build cards')
  expect(result).toEqual({ viewId: expect.any(String), mode: 'handoff', sessionId: 'child' })
  expect(result).not.toHaveProperty('url')
  expect(sent).toHaveLength(1)
  expect(sent[0].isNew).toBe(false)
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
        ? await createViewFromSession(ws, 'source', 'Build cards')
        : await submitView(ws, (await createPendingView(ws.id, ws.path)).id, {
            requirements: 'Build cards'
          })
    expect(forks).toBe(0)
    expect(sent).toHaveLength(entry === 'cli' ? 0 : 1)
    expect(await getSessionRecord(ws.path, 'source')).toEqual({ tabId: 'views/original' })
    expect(await getSelectedSession(ws.path, `views/${result.viewId}`)).toBeUndefined()
    await pinSession(ws.path, null)
    await sendWorkspaceMessage(ws, {
      workspaceId: ws.id,
      workspacePath: ws.path,
      sessionId: 'new-chat',
      isNew: true,
      content: 'Continue',
      context: { activeTab: `views/${result.viewId}` }
    })
    expect(await getSessionRecord(ws.path, 'new-chat')).toEqual({ tabId: `views/${result.viewId}` })
    expect(sent.at(-1)?.context?.directives).toContain(
      `View id: ${result.viewId} (already assigned)`
    )
  }
)
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
    await completeViewBuild(ws.id, ws.path, input.context!.activeTab.slice('views/'.length))
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
    context: { activeTab: `views/${view.id}` }
  })
  expect(sent[0].context?.directives).toContain(
    'Original view requirements:\nBuild a gardening board with watering reminders'
  )
  expect(await getSessionRecord(ws.path, 'fresh')).toEqual({ tabId: `views/${view.id}` })
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
      context: { activeTab: `views/${view.id}` }
    })
  ).rejects.toThrow('Unavailable')
  expect((await getPendingView(ws.path, view.id))?.status).toBe('draft')
})
