import { afterEach, beforeEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { WorkspaceEntry } from '@/lib/types'
import { harnessFor } from './harness/registry'
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
import { saveSessionConfig } from './session-config'
import { DATA_DIR } from './data-dir'
import { setEventServer } from './events'
const harness = harnessFor('codex')
const original = {
  forkSession: harness.forkSession,
  sendMessage: harness.sendMessage,
  listSessions: harness.listSessions,
  sessionEvents: harness.sessionEvents,
  activeSessions: harness.activeSessions
}
let dir: string
let ws: WorkspaceEntry
let sent: SendMessageInput[]
let events: unknown[]
let forks: number
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'moi-view-sessions-'))
  ws = { id: 'test', path: dir, type: 'codex', addedAt: '' }
  setPendingViewStorePath(join(dir, 'pending-views.json'))
  setSessionStorePath(join(dir, 'sessions.json'))
  setSelectedSessionPath(join(dir, 'selection.json'))
  sent = []
  events = []
  forks = 0
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
test('source settings are copied into handoff', async () => {
  await saveSessionConfig(ws.path, 'source', { model: 'model', effort: 'high', fastMode: true })
  await createViewFromSession(ws, 'source', 'Build cards')
  expect(sent[0]).toMatchObject({ model: 'model', effort: 'high', fastMode: true })
})
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
test('discard blocks startup and active construction, preserves chat provenance afterward', async () => {
  const view = await createPendingView(ws.id, ws.path)
  await beginViewBuild(ws.id, ws.path, view.id, 'Cards', 'child', false)
  await expect(discardPendingView(ws.id, ws.path, view.id, new Set())).rejects.toThrow(
    'only be closed'
  )
  await failInterruptedViewStarts(ws)
  await patchSessionRecord(ws.path, 'child', {
    tabId: `views/${view.id}`,
    forkedFromSessionId: 'source'
  })
  await expect(discardPendingView(ws.id, ws.path, view.id, new Set(['child']))).rejects.toThrow(
    'only be closed'
  )
  await discardPendingView(ws.id, ws.path, view.id, new Set())
  expect(await getSessionRecord(ws.path, 'child')).toEqual({
    forkedFromSessionId: 'source'
  })
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
