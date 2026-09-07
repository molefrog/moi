import { afterEach, describe, expect, test } from 'bun:test'

import { QueryClient } from '@tanstack/react-query'

import { workspaceKeys } from '@/client/api/workspace-keys'
import {
  attachmentsForSend,
  ownsComposerAttachments,
  resolveChatRunOptions,
  startOptimisticSession,
  startOptimisticTurn,
  withAttachmentDirectives
} from '@/client/features/chat/chat-send'
import { attachmentKey, type ChatAttachment, liveStore } from '@/client/features/chat/chat-store'
import type { SessionInfo, ViewState, WorkspaceAgent } from '@/lib/types'
import { resolveSelectedModel } from './composer/model-order'

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

describe('startOptimisticSession', () => {
  test('adds a first-message fallback to the session list immediately', () => {
    const queryClient = new QueryClient()
    startOptimisticSession({
      queryClient,
      workspaceId,
      sessionId,
      text: 'Build a customer dashboard with useful charts'
    })

    expect(
      queryClient.getQueryData<SessionInfo[]>(workspaceKeys.sessions(workspaceId))
    ).toMatchObject([
      {
        sessionId,
        summary: 'Build a customer dashboard with useful charts'
      }
    ])
  })

  test('uses filenames for an attachment-only chat', () => {
    const queryClient = new QueryClient()
    startOptimisticSession({
      queryClient,
      workspaceId,
      sessionId,
      text: '',
      filenames: ['brief.pdf']
    })

    expect(
      queryClient.getQueryData<SessionInfo[]>(workspaceKeys.sessions(workspaceId))?.[0]?.summary
    ).toBe('brief.pdf')
  })
})

describe('resolveChatRunOptions', () => {
  const models: WorkspaceAgent = {
    provider: 'claude-code',
    availability: { status: 'available' },
    supportsStreaming: true,
    models: [
      {
        value: 'sonnet',
        displayName: 'Sonnet',
        supportsFastMode: true,
        supportedEffortLevels: ['low', 'high']
      },
      {
        value: 'haiku',
        displayName: 'Haiku',
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

  test('keeps enabled and explicitly disabled Fast mode for a supported model', () => {
    expect(resolveChatRunOptions(models, 'sonnet', 'high', true)).toEqual({
      model: 'sonnet',
      effort: 'high',
      fastMode: true,
      stream: true
    })
    expect(resolveChatRunOptions(models, 'sonnet', 'high', false)).toEqual({
      model: 'sonnet',
      effort: 'high',
      fastMode: false,
      stream: true
    })
  })

  test('disables Fast mode for a known unsupported model without dropping the preference', () => {
    expect(resolveChatRunOptions(models, 'haiku', 'high', true)).toEqual({
      model: 'haiku',
      effort: 'high',
      fastMode: false,
      stream: true
    })
  })

  test('keeps Fast mode for a stale model that the client cannot validate', () => {
    expect(resolveChatRunOptions(models, 'removed-model', 'high', true)).toEqual({
      model: undefined,
      effort: 'high',
      fastMode: true,
      stream: true
    })
  })

  test('omits Fast mode when no moi preference exists', () => {
    expect(resolveChatRunOptions(models, 'sonnet', 'high')).not.toHaveProperty('fastMode')
  })
})

describe('Codex model selection', () => {
  const catalog: WorkspaceAgent = {
    provider: 'codex',
    availability: { status: 'available' },
    models: [
      { value: 'default', resolvedModel: 'gpt-5.6-sol', displayName: '5.6 Sol' },
      { value: 'gpt-5.6-luna', displayName: '5.6 Luna', supportedEffortLevels: ['low', 'medium'] },
      {
        value: 'gpt-5.6-sol',
        resolvedModel: 'gpt-5.6-sol',
        displayName: '5.6 Sol',
        supportedEffortLevels: ['low', 'xhigh'],
        supportsFastMode: true
      }
    ]
  }

  for (const pick of [undefined, 'default', 'gpt-6-astra', 'gpt-5.6-sol']) {
    test(`sends the displayed Sol model for ${pick ?? 'an implicit default'}`, () => {
      const displayed = resolveSelectedModel(catalog.models, pick)
      const run = resolveChatRunOptions(catalog, pick, 'xhigh', true)
      expect(displayed?.displayName).toBe('5.6 Sol')
      expect(run).toMatchObject({ model: displayed?.value, effort: 'xhigh', fastMode: true })
    })
  }

  test('an explicit choice overrides the configured default and validates its capabilities', () => {
    expect(resolveChatRunOptions(catalog, 'gpt-5.6-luna', 'xhigh', true)).toMatchObject({
      model: 'gpt-5.6-luna',
      effort: undefined,
      fastMode: false
    })
  })

  test('an unavailable default uses the same first catalog row as the picker', () => {
    const data = { ...catalog, models: catalog.models.filter(model => model.value !== 'default') }
    expect(resolveChatRunOptions(data, undefined, 'low').model).toBe('gpt-5.6-luna')
  })

  test('sends the native model id when it differs from the picker row id', () => {
    const data = {
      ...catalog,
      models: [{ value: 'catalog-sol', resolvedModel: 'gpt-5.6-sol', displayName: '5.6 Sol' }]
    }
    expect(resolveChatRunOptions(data, 'catalog-sol', undefined).model).toBe('gpt-5.6-sol')
  })

  test('preserves an explicit choice while the catalog is loading', () => {
    expect(resolveChatRunOptions(undefined, 'gpt-5.6-sol', 'low').model).toBe('gpt-5.6-sol')
  })
})

// The composer's staged files belong to the message the USER is writing. An
// applet firing a message must not walk off with them — nor clear the list,
// which would also drop still-uploading files the user never sent.
describe('composer attachments', () => {
  const staged: ChatAttachment[] = [
    {
      kind: 'file',
      localId: 'a1',
      name: 'report.pdf',
      mediaType: 'application/pdf',
      status: 'ready',
      upload: { id: 'up-1', kind: 'file' } as ChatAttachment['upload']
    },
    {
      kind: 'file',
      localId: 'a2',
      name: 'big.mov',
      mediaType: 'video/quicktime',
      status: 'uploading'
    },
    {
      kind: 'drawing',
      purpose: 'annotation',
      localId: 'a3',
      name: 'Annotation.png',
      mediaType: 'image/png',
      sourceTab: 'widgets',
      status: 'draft'
    }
  ]

  const stage = () =>
    liveStore.setState({ attachments: { [attachmentKey(workspaceId, sessionId)]: staged } })

  test('a composer send carries the uploaded ones and skips uploading and draft ones', () => {
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

  test('adds annotation source tabs at their image positions', () => {
    const annotations: ChatAttachment[] = [
      {
        kind: 'file',
        localId: 'image-1',
        name: 'Reference.png',
        mediaType: 'image/png',
        status: 'ready',
        upload: { id: 'up-image', kind: 'image' } as ChatAttachment['upload']
      },
      {
        kind: 'drawing',
        purpose: 'annotation',
        localId: 'annotation-1',
        name: 'Annotation.png',
        mediaType: 'image/png',
        sourceTab: 'widgets',
        status: 'ready',
        upload: { id: 'up-annotation', kind: 'image' } as ChatAttachment['upload']
      },
      {
        kind: 'drawing',
        purpose: 'annotation',
        localId: 'annotation-2',
        name: 'Annotation.png',
        mediaType: 'image/png',
        sourceTab: 'view:roadmap',
        status: 'ready',
        upload: { id: 'up-annotation-2', kind: 'image' } as ChatAttachment['upload']
      }
    ]

    expect(withAttachmentDirectives({ directives: ['Keep this concise.'] }, annotations)).toEqual({
      directives: [
        'Keep this concise.',
        'Annotation attachment sources in attachment order: 2. "widgets"; 3. "view:roadmap".'
      ]
    })
  })

  test('does not add composer annotation directives to applet sends', () => {
    const annotation: ChatAttachment = {
      kind: 'drawing',
      purpose: 'annotation',
      localId: 'annotation-1',
      name: 'Annotation.png',
      mediaType: 'image/png',
      sourceTab: 'widgets',
      status: 'ready',
      upload: { id: 'up-annotation', kind: 'image' } as ChatAttachment['upload']
    }
    const options = { applet: { source: 'widget:late-orders' } }
    expect(withAttachmentDirectives(options, [annotation])).toBe(options)
  })

  test('describes a new-view sketch at its image position', () => {
    const sketch: ChatAttachment = {
      kind: 'drawing',
      purpose: 'sketch',
      localId: 'sketch-1',
      name: 'Sketch.png',
      mediaType: 'image/png',
      sourceTab: 'view-builder:draft-1',
      status: 'ready',
      upload: { id: 'up-sketch', kind: 'image' } as ChatAttachment['upload']
    }

    expect(withAttachmentDirectives(undefined, [sketch])).toEqual({
      directives: [
        'Sketch attachment sources in attachment order: 1. "view-builder:draft-1". Each sketch shows the intended layout of a new view.'
      ]
    })
  })

  test('only a composer send may clear the staged list', () => {
    expect(ownsComposerAttachments(undefined)).toBe(true)
    expect(ownsComposerAttachments({ directives: ['x'] })).toBe(true)
    expect(ownsComposerAttachments({ applet: { source: 'widget:late-orders' } })).toBe(false)
  })
})
