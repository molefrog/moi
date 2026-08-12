import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { ViewBuilder } from '@/lib/types'

import { api } from './api'
import { DATA_DIR } from './data-dir'
import { codexHarness } from './harness/codex'
import type { SendMessageInput } from './harness/types'
import { DEFAULT_REGISTRY_PATH, registerWorkspace, setRegistryPath } from './registry'
import { DEFAULT_SELECTED_SESSION_PATH, setSelectedSessionPath } from './selected-session'
import { addUpload } from './uploads'
import { setViewBuilderStorePath } from './view-builders'

let tempDir: string
const originalCodexAvailability = codexHarness.availability
const originalCodexSendMessage = codexHarness.sendMessage

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'moi-api-view-builders-'))
  setRegistryPath(join(tempDir, 'workspaces.json'))
  setSelectedSessionPath(join(tempDir, 'selected-sessions.json'))
  setViewBuilderStorePath(join(tempDir, 'view-builders.json'))
  codexHarness.availability = async () => ({ available: true })
  codexHarness.sendMessage = async () => {}
})

afterEach(async () => {
  codexHarness.availability = originalCodexAvailability
  codexHarness.sendMessage = originalCodexSendMessage
  setRegistryPath(DEFAULT_REGISTRY_PATH)
  setSelectedSessionPath(DEFAULT_SELECTED_SESSION_PATH)
  setViewBuilderStorePath(join(DATA_DIR, 'view-builders.json'))
  await rm(tempDir, { recursive: true, force: true })
})

describe('view builder sketch submission', () => {
  test('accepts a sketch-only first message and forwards its context', async () => {
    const workspacePath = join(tempDir, 'workspace')
    await mkdir(workspacePath)
    const workspace = await registerWorkspace(workspacePath, { type: 'codex' })
    const createResponse = await api.request(`/api/workspaces/${workspace.id}/view-builders`, {
      method: 'POST'
    })
    const draft = (await createResponse.json()) as ViewBuilder
    const upload = await addUpload({
      workspaceId: workspace.id,
      filename: 'Sketch.png',
      mediaType: 'image/png',
      bytes: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        'base64'
      )
    })
    let sent: SendMessageInput | null = null
    codexHarness.sendMessage = async input => {
      sent = input
    }

    const response = await api.request(
      `/api/workspaces/${workspace.id}/view-builders/${draft.id}/submit`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { requirements: '' },
          attachments: [upload.id],
          availableIcons: ['chart']
        })
      }
    )

    if (!response.ok) throw new Error(await response.text())
    expect(response.status).toBe(200)
    expect(sent?.attachments).toEqual([upload.id])
    expect(sent?.content).toBe('')
    expect(sent?.context?.directives).toContain(
      "The attached image is the user's sketch of the intended view layout."
    )
  })

  test('rejects a first message with neither text nor a sketch', async () => {
    const workspace = await registerWorkspace(join(tempDir, 'workspace'), { type: 'codex' })
    const createResponse = await api.request(`/api/workspaces/${workspace.id}/view-builders`, {
      method: 'POST'
    })
    const draft = (await createResponse.json()) as ViewBuilder

    const response = await api.request(
      `/api/workspaces/${workspace.id}/view-builders/${draft.id}/submit`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: { requirements: '' }, availableIcons: ['chart'] })
      }
    )

    expect(response.status).toBe(400)
    expect(await response.text()).toBe('View requirements or a sketch are required')
  })

  test('rejects malformed sketch upload ids', async () => {
    const workspace = await registerWorkspace(join(tempDir, 'workspace'), { type: 'codex' })
    const createResponse = await api.request(`/api/workspaces/${workspace.id}/view-builders`, {
      method: 'POST'
    })
    const draft = (await createResponse.json()) as ViewBuilder

    const response = await api.request(
      `/api/workspaces/${workspace.id}/view-builders/${draft.id}/submit`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { requirements: '' },
          attachments: ['not-an-upload'],
          availableIcons: ['chart']
        })
      }
    )

    expect(response.status).toBe(400)
    expect(await response.text()).toBe('Invalid sketch attachment')
  })
})

describe('view builder availability', () => {
  test('rejects submission before changing a builder to building', async () => {
    const workspace = await registerWorkspace(join(tempDir, 'workspace'), { type: 'codex' })
    const createResponse = await api.request(`/api/workspaces/${workspace.id}/view-builders`, {
      method: 'POST'
    })
    const draft = (await createResponse.json()) as ViewBuilder
    const reason =
      'Run curl -fsSL https://chatgpt.com/codex/install.sh | sh in your terminal to install Codex'
    codexHarness.availability = async () => ({ available: false, reason })

    const response = await api.request(
      `/api/workspaces/${workspace.id}/view-builders/${draft.id}/submit`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { requirements: 'Build a customer dashboard' },
          availableIcons: ['chart']
        })
      }
    )

    expect(response.status).toBe(400)
    expect(await response.text()).toBe(reason)

    const listResponse = await api.request(`/api/workspaces/${workspace.id}/view-builders`)
    const { builders } = (await listResponse.json()) as { builders: ViewBuilder[] }
    expect(builders).toHaveLength(1)
    expect(builders[0].status).toBe('draft')
  })
})
