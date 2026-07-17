import { afterEach, describe, expect, test } from 'bun:test'

import { QueryClient } from '@tanstack/react-query'

import { workspaceKeys } from '@/client/api/workspace-keys'
import { resolveChatRunOptions, startOptimisticTurn } from '@/client/features/chat/chat-send'
import { liveStore } from '@/client/features/chat/chat-store'
import type { ViewState, WorkspaceModels } from '@/lib/types'

const workspaceId = 'workspace-1'
const sessionId = 'session-1'

afterEach(() => {
  liveStore.setState({ processing: {}, errors: {} })
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
    expect(liveStore.getState().processing[`${workspaceId}:${sessionId}`]).toBe(true)
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
