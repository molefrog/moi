import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { selectChatSession } from './chat-selection'
import { setEventServer } from './events'
import {
  DEFAULT_SELECTED_SESSION_PATH,
  getSelectedSession,
  initializeSelectedSession,
  renameSelectedSession,
  setSelectedSessionPath
} from './selected-session'

let directory: string
let events: unknown[]
const workspace = { id: 'workspace', path: '/workspace' }

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'moi-chat-selection-'))
  setSelectedSessionPath(join(directory, 'selected-sessions.json'))
  events = []
  setEventServer({ publish: (_topic, data) => events.push(JSON.parse(data)) })
})

afterEach(async () => {
  setSelectedSessionPath(DEFAULT_SELECTED_SESSION_PATH)
  setEventServer({ publish: () => {} })
  await rm(directory, { recursive: true, force: true })
})

describe('automatic chat selection', () => {
  test.each([null, 'someone-elses-chat'])(
    'a personal chat preserves shared selection %p',
    async previous => {
      await initializeSelectedSession(workspace.path, previous)

      await selectChatSession(workspace, 'personal-chat', true, null)
      // A provider's replacement id must not create a shared selection either.
      await renameSelectedSession(workspace.path, 'personal-chat', 'provider-id')

      expect(await getSelectedSession(workspace.path)).toBe(previous)
      expect(events).toEqual([])
    }
  )

  test.each([undefined, false])(
    'a new shared chat selects and broadcasts with personalSelection=%p',
    async personalSelection => {
      await initializeSelectedSession(workspace.path, null)

      await selectChatSession(workspace, 'new-chat', personalSelection, null)

      expect(await getSelectedSession(workspace.path)).toBe('new-chat')
      expect(events).toEqual([
        { type: 'selected-session:updated', workspaceId: workspace.id, sessionId: 'new-chat' }
      ])
    }
  )

  test('a shared chat does not overwrite a newer selection and resolves provider ids', async () => {
    await initializeSelectedSession(workspace.path, null)
    await renameSelectedSession(workspace.path, 'temporary', 'provider-id')

    await selectChatSession(workspace, 'temporary', false, null)
    await selectChatSession(workspace, 'late-chat', false, null)

    expect(await getSelectedSession(workspace.path)).toBe('provider-id')
    expect(events).toEqual([
      { type: 'selected-session:updated', workspaceId: workspace.id, sessionId: 'provider-id' }
    ])
  })
})
