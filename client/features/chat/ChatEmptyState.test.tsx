import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { describe, expect, test } from 'bun:test'

import {
  ChatEmptyState,
  type ChatEmptyStateKind,
  resolveChatEmptyState
} from '@/client/features/chat/ChatEmptyState'

function renderState(kind: ChatEmptyStateKind, hasWorkspaceApplets = false): string {
  return renderToStaticMarkup(
    createElement(ChatEmptyState, {
      agent: 'boxy',
      kind,
      hasWorkspaceApplets,
      onSelectPrompt: () => undefined,
      onNavigate: () => undefined
    })
  )
}

describe('resolveChatEmptyState', () => {
  test('gives the welcome state first priority', () => {
    expect(
      resolveChatEmptyState({
        isViewBuilderDraft: false,
        hasSentMessageFromMoi: false,
        isWorkspacePendingAnalysis: true
      })
    ).toBe('welcome')
  })

  test('shows the workspace exploration state for a pending imported workspace', () => {
    expect(
      resolveChatEmptyState({
        isViewBuilderDraft: false,
        hasSentMessageFromMoi: true,
        isWorkspacePendingAnalysis: true
      })
    ).toBe('explore-workspace')
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
    expect(renderState('welcome')).toContain('moi is the visual workspace')
    expect(renderState('welcome')).toContain('Try an example:')
    expect(renderState('explore-workspace')).toContain('Start with what’s already here')
    expect(renderState('explore-workspace')).toContain(
      'Your agent can explore this workspace and suggest useful widgets and views based on its contents.'
    )
    expect(renderState('explore-workspace')).toContain('Explore the workspace')
    expect(renderState('empty')).toContain('Chat with your agent')
    for (const kind of ['welcome', 'explore-workspace', 'empty'] as const) {
      const html = renderState(kind)
      expect(html).toContain('mo-root')
      expect(html).toContain('--mo-head:var(--accent)')
      expect(html).toContain('--mo-eye:var(--accent-foreground)')
    }
  })

  test('renders the focused new-view prompt', () => {
    const html = renderState('view-builder')

    expect(html).toContain('mo-root')
    expect(html).toContain('--mo-head:var(--accent)')
    expect(html).toContain('--mo-eye:var(--accent-foreground)')
    expect(html).not.toContain('tabler-icon-table-spark')
    expect(html).toContain('Describe the content, data, and key actions you need in the view')
  })

  test('replaces the plain empty-state icon with the agent Blobatar', () => {
    const html = renderState('empty')

    expect(html).toContain('mo-root')
    expect(html).not.toContain('tabler-icon-messages')
  })

  test('hides examples when the workspace already has applets', () => {
    const html = renderState('welcome', true)

    expect(html).toContain('moi is the visual workspace')
    expect(html).not.toContain('Try an example:')
    expect(html).not.toContain('Check the weather')
    expect(html).not.toContain('Track my finances')
    expect(html).not.toContain('Build a playful synthesizer')
  })
})
