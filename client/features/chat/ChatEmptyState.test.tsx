import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { describe, expect, test } from 'bun:test'

import {
  ChatEmptyState,
  type ChatEmptyStateKind,
  resolveChatEmptyState
} from '@/client/features/chat/ChatEmptyState'

function renderState(kind: ChatEmptyStateKind): string {
  return renderToStaticMarkup(
    createElement(ChatEmptyState, {
      kind,
      onSelectPrompt: () => undefined
    })
  )
}

describe('resolveChatEmptyState', () => {
  test('gives the global chat welcome first priority', () => {
    expect(
      resolveChatEmptyState({
        isViewBuilderDraft: false,
        hasSentMessageFromMoi: false,
        isWorkspacePendingAnalysis: true
      })
    ).toBe('chat-welcome')
  })

  test('shows the workspace welcome for a pending imported workspace', () => {
    expect(
      resolveChatEmptyState({
        isViewBuilderDraft: false,
        hasSentMessageFromMoi: true,
        isWorkspacePendingAnalysis: true
      })
    ).toBe('workspace-welcome')
  })

  test('uses the simple empty state without pending analysis', () => {
    expect(
      resolveChatEmptyState({
        isViewBuilderDraft: false,
        hasSentMessageFromMoi: true,
        isWorkspacePendingAnalysis: false
      })
    ).toBe('empty')
  })

  test('gives the view builder priority', () => {
    expect(
      resolveChatEmptyState({
        isViewBuilderDraft: true,
        hasSentMessageFromMoi: false,
        isWorkspacePendingAnalysis: true
      })
    ).toBe('view-builder')
  })
})

describe('ChatEmptyState', () => {
  test('renders the selected empty state', () => {
    expect(renderState('chat-welcome')).toContain('moi is the visual workspace')
    expect(renderState('workspace-welcome')).toContain('Explore the workspace')
    expect(renderState('empty')).toContain('Chat with your agent')
  })

  test('renders the focused new-view prompt', () => {
    expect(renderState('view-builder')).toContain(
      'Describe the content, data, and key actions you need in this view'
    )
  })
})
