import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { PendingView } from '@/lib/types'

import { api } from './api'
import { DATA_DIR } from './data-dir'
import { setEventServer } from './events'
import { codexHarness } from './harness/codex'
import type { SendMessageInput } from './harness/types'
import { DEFAULT_REGISTRY_PATH, registerWorkspace, setRegistryPath } from './registry'
import {
  DEFAULT_SELECTED_SESSION_PATH,
  getSelectedSession,
  saveSelectedSession,
  setSelectedSessionPath
} from './selected-session'
import { viewTabId } from '@/lib/workspace-tabs'
import { addUpload } from './uploads'
import { setPendingViewStorePath } from './pending-views'
import { DEFAULT_SESSION_STORE_PATH, setSessionStorePath } from './session-store'

let tempDir: string
let events: { type: string; workspaceId?: string; sessionId?: string | null }[]
const originalCodexAvailability = codexHarness.availability
const originalCodexSendMessage = codexHarness.sendMessage

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'moi-api-pending-views-'))
  setRegistryPath(join(tempDir, 'workspaces.json'))
  setSelectedSessionPath(join(tempDir, 'selected-sessions.json'))
  setPendingViewStorePath(join(tempDir, 'pending-views.json'))
  setSessionStorePath(join(tempDir, 'sessions.json'))
  codexHarness.availability = async () => ({ status: 'available' })
  codexHarness.sendMessage = async () => {}
  events = []
  setEventServer({ publish: (_topic, data) => events.push(JSON.parse(data)) })
})

afterEach(async () => {
  codexHarness.availability = originalCodexAvailability
  codexHarness.sendMessage = originalCodexSendMessage
  setEventServer({ publish: () => {} })
  setRegistryPath(DEFAULT_REGISTRY_PATH)
  setSelectedSessionPath(DEFAULT_SELECTED_SESSION_PATH)
  setPendingViewStorePath(join(DATA_DIR, 'pending-views.json'))
  setSessionStorePath(DEFAULT_SESSION_STORE_PATH)
  await rm(tempDir, { recursive: true, force: true })
})

describe('pending view sketch submission', () => {
  test('accepts a sketch-only first message and forwards its context', async () => {
    const workspacePath = join(tempDir, 'workspace')
    await mkdir(workspacePath)
    const workspace = await registerWorkspace(workspacePath, { type: 'codex' })
    const createResponse = await api.request(`/api/workspaces/${workspace.id}/views`, {
      method: 'POST'
    })
    const draft = (await createResponse.json()) as PendingView
    const upload = await addUpload({
      workspaceId: workspace.id,
      filename: 'Sketch.png',
      mediaType: 'image/png',
      bytes: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        'base64'
      )
    })
    const sent: SendMessageInput[] = []
    codexHarness.sendMessage = async input => {
      sent.push(input)
    }

    const response = await api.request(`/api/workspaces/${workspace.id}/views/${draft.id}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requirements: '',
        attachments: [{ type: 'upload', uploadId: upload.id }]
      })
    })

    if (!response.ok) throw new Error(await response.text())
    expect(response.status).toBe(200)
    expect(sent[0]?.attachments).toEqual([{ type: 'upload', uploadId: upload.id }])
    expect(sent[0]?.content).toBe('')
    expect(sent[0]?.context?.directives).toContain(
      'Use the attachments as reference material for the intended view.'
    )
  })

  test.each([false, true])('forwards context with optional file uploads: %s', async withUpload => {
    const workspacePath = join(tempDir, 'workspace')
    await mkdir(workspacePath)
    const workspace = await registerWorkspace(workspacePath, { type: 'codex' })
    const created = await api.request(`/api/workspaces/${workspace.id}/views`, {
      method: 'POST'
    })
    const draft = (await created.json()) as PendingView
    const attachments: NonNullable<SendMessageInput['attachments']> = [
      { type: 'text', source: 'view:orders', label: 'Order', text: 'Order ID: 1042' }
    ]
    if (withUpload) {
      for (const filename of ['requirements.txt', 'notes.txt']) {
        const upload = await addUpload({
          workspaceId: workspace.id,
          filename,
          mediaType: 'text/plain',
          bytes: Buffer.from('Reference material')
        })
        attachments.push({ type: 'upload', uploadId: upload.id })
      }
    }
    const sent: SendMessageInput[] = []
    codexHarness.sendMessage = async input => {
      sent.push(input)
    }
    const response = await api.request(`/api/workspaces/${workspace.id}/views/${draft.id}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requirements: '',
        attachments
      })
    })
    expect(response.status).toBe(200)
    expect(sent[0]?.attachments).toEqual(attachments)
    expect(sent[0]?.content).toBe('')
  })

  test('rejects a first message with neither text nor a sketch', async () => {
    const workspace = await registerWorkspace(join(tempDir, 'workspace'), { type: 'codex' })
    const createResponse = await api.request(`/api/workspaces/${workspace.id}/views`, {
      method: 'POST'
    })
    const draft = (await createResponse.json()) as PendingView

    const response = await api.request(`/api/workspaces/${workspace.id}/views/${draft.id}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requirements: '' })
    })

    expect(response.status).toBe(400)
    expect(await response.text()).toBe('View requirements or an attachment are required')
  })

  test('rejects malformed sketch upload ids', async () => {
    const workspace = await registerWorkspace(join(tempDir, 'workspace'), { type: 'codex' })
    const createResponse = await api.request(`/api/workspaces/${workspace.id}/views`, {
      method: 'POST'
    })
    const draft = (await createResponse.json()) as PendingView

    const response = await api.request(`/api/workspaces/${workspace.id}/views/${draft.id}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requirements: '',
        attachments: ['not-an-upload']
      })
    })

    expect(response.status).toBe(400)
    expect(await response.text()).toBe('Invalid attachments')
  })
})

describe('pending view availability', () => {
  test('rejects submission before starting a view build', async () => {
    const workspace = await registerWorkspace(join(tempDir, 'workspace'), { type: 'codex' })
    const createResponse = await api.request(`/api/workspaces/${workspace.id}/views`, {
      method: 'POST'
    })
    const draft = (await createResponse.json()) as PendingView
    const reason =
      'Run curl -fsSL https://chatgpt.com/codex/install.sh | sh in your terminal to install Codex'
    codexHarness.availability = async () => ({ status: 'unavailable', reason })

    const response = await api.request(`/api/workspaces/${workspace.id}/views/${draft.id}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requirements: 'Build a customer dashboard'
      })
    })

    expect(response.status).toBe(400)
    expect(await response.text()).toBe(reason)

    const listResponse = await api.request(`/api/workspaces/${workspace.id}/views`)
    const { views } = (await listResponse.json()) as { views: PendingView[] }
    expect(views).toHaveLength(1)
    expect(views[0].status).toBe('draft')
  })
})

describe('pending view chat selection', () => {
  test.each([
    { selectedSessionScope: 'browser-tab', previous: null },
    { selectedSessionScope: 'browser-tab', previous: 'other-chat' },
    { selectedSessionScope: 'shared', previous: 'other-chat' },
    { selectedSessionScope: undefined, previous: 'other-chat' }
  ] as const)('respects selection ownership %j', async ({ selectedSessionScope, previous }) => {
    const workspace = await registerWorkspace(join(tempDir, 'workspace'), { type: 'codex' })
    const createResponse = await api.request(`/api/workspaces/${workspace.id}/views`, {
      method: 'POST'
    })
    const draft = (await createResponse.json()) as PendingView
    if (previous)
      await saveSelectedSession(workspace.path, previous, undefined, viewTabId(draft.id))
    const sent: SendMessageInput[] = []
    codexHarness.sendMessage = async input => {
      sent.push(input)
    }

    const response = await api.request(`/api/workspaces/${workspace.id}/views/${draft.id}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requirements: 'Build a dashboard',
        selectedSessionScope
      })
    })

    expect(response.status).toBe(200)
    const result = (await response.json()) as { sessionId: string }
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ sessionId: result.sessionId, isNew: true })
    expect(await getSelectedSession(workspace.path, viewTabId(draft.id))).toBe(
      selectedSessionScope === 'browser-tab' ? (previous ?? undefined) : result.sessionId
    )
    expect(events.filter(event => event.type === 'selected-session:updated')).toEqual(
      selectedSessionScope === 'browser-tab'
        ? []
        : [
            {
              type: 'selected-session:updated',
              workspaceId: workspace.id,
              sessionId: result.sessionId
            }
          ]
    )
  })

  test('rejects a malformed selection scope before starting a view', async () => {
    const workspace = await registerWorkspace(join(tempDir, 'workspace'), { type: 'codex' })
    const createResponse = await api.request(`/api/workspaces/${workspace.id}/views`, {
      method: 'POST'
    })
    const draft = (await createResponse.json()) as PendingView
    const response = await api.request(`/api/workspaces/${workspace.id}/views/${draft.id}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requirements: 'Build a dashboard',
        selectedSessionScope: 'tab'
      })
    })

    expect(response.status).toBe(400)
    expect(await response.text()).toBe('Invalid selectedSessionScope')
    const listResponse = await api.request(`/api/workspaces/${workspace.id}/views`)
    const { views } = (await listResponse.json()) as { views: PendingView[] }
    expect(views[0].status).toBe('draft')
    expect(events.filter(event => event.type === 'selected-session:updated')).toEqual([])
  })
})
