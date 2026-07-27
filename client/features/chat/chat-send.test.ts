import { afterEach, describe, expect, test } from 'bun:test'

import { QueryClient } from '@tanstack/react-query'

import { workspaceKeys } from '@/client/api/workspace-keys'
import {
  attachmentsForSend,
  ownsComposerAttachments,
  resolveChatRunOptions,
  startOptimisticTurn
} from '@/client/features/chat/chat-send'
import { type ChatAttachment, draftKey, liveStore } from '@/client/features/chat/chat-store'
import type { ViewState, WorkspaceModels } from '@/lib/types'

const workspaceId = 'workspace-1'
const sessionId = 'session-1'

afterEach(() => {
  liveStore.setState({ activity: {}, errors: {}, attachments: {} })
})

describe('startOptimisticTurn', () => {
  test('adds the user turn and starts processing', () => {
    const queryClient = new QueryClient()
    const optimisticId = startOptimisticTurn({
      queryClient,
      workspaceId,
      sessionId,
      parts: [{ type: 'text', text: 'Build a dashboard' }]
    })

    const view = queryClient.getQueryData<ViewState>(workspaceKeys.events(workspaceId, sessionId))
    expect(optimisticId).toStartWith('optimistic:')
    expect(view?.turns[0]?.parts).toEqual([{ type: 'text', text: 'Build a dashboard' }])
    expect(liveStore.getState().activity[`${workspaceId}:${sessionId}`]).toBe('running')
  })
})

describe('resolveChatRunOptions', () => {
  const models: WorkspaceModels = {
    provider: 'claude-code',
    supportsStreaming: true,
    models: [
      {
        value: 'sonnet',
        displayName: 'Sonnet',
        supportedEffortLevels: ['low', 'high']
      }
    ]
  }

  test('keeps supported run options', () => {
    expect(resolveChatRunOptions(models, 'sonnet', 'high')).toEqual({
      model: 'sonnet',
      effort: 'high',
      stream: true
    })
  })

  test('keeps the implicit effort unset', () => {
    expect(resolveChatRunOptions(models, 'sonnet', undefined)).toEqual({
      model: 'sonnet',
      effort: undefined,
      stream: true
    })
  })

  test('drops a stale model and keeps an effort it cannot validate', () => {
    expect(resolveChatRunOptions(models, 'removed-model', 'medium')).toEqual({
      model: undefined,
      effort: 'medium',
      stream: true
    })
  })

  test('drops an unsupported effort for a known model', () => {
    expect(resolveChatRunOptions(models, 'sonnet', 'medium')).toEqual({
      model: 'sonnet',
      effort: undefined,
      stream: true
    })
  })
})

// The composer's staged files belong to the message the USER is writing. An
// applet firing a message must not walk off with them — nor clear the list,
// which would also drop still-uploading files the user never sent.
describe('composer attachments', () => {
  const staged: ChatAttachment[] = [
    {
      localId: 'a1',
      name: 'report.pdf',
      mediaType: 'application/pdf',
      status: 'ready',
      upload: { id: 'up-1', kind: 'file' } as ChatAttachment['upload']
    },
    { localId: 'a2', name: 'big.mov', mediaType: 'video/quicktime', status: 'uploading' }
  ]

  const stage = () =>
    liveStore.setState({ attachments: { [draftKey(workspaceId, sessionId)]: staged } })

  test('a composer send carries the uploaded ones and skips those still uploading', () => {
    stage()
    expect(attachmentsForSend(workspaceId, sessionId, undefined).map(a => a.localId)).toEqual([
      'a1'
    ])
  })

  test('an applet send carries none, however much is staged', () => {
    stage()
    const applet = { applet: { source: 'widget:late-orders' } }
    expect(attachmentsForSend(workspaceId, sessionId, applet)).toEqual([])
  })

  test('directives alone do not make a send foreign to the composer', () => {
    stage()
    const withDirectives = { directives: ['Do the thing first.'] }
    expect(attachmentsForSend(workspaceId, sessionId, withDirectives).map(a => a.localId)).toEqual([
      'a1'
    ])
  })

  test('only a composer send may clear the staged list', () => {
    expect(ownsComposerAttachments(undefined)).toBe(true)
    expect(ownsComposerAttachments({ directives: ['x'] })).toBe(true)
    expect(ownsComposerAttachments({ applet: { source: 'widget:late-orders' } })).toBe(false)
  })
})
