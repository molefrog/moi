import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { describe, expect, test } from 'bun:test'

import {
  ChatWorkspaceWelcome,
  WORKSPACE_ANALYSIS_PROMPTS
} from '@/client/features/chat/ChatEmptyState'
import { renderMoiContext } from '@/lib/moi-context'

const workspaceAnalysisPrompt = WORKSPACE_ANALYSIS_PROMPTS[0]

describe('ChatWorkspaceWelcome', () => {
  test('renders the workspace analysis copy and one plain prompt', () => {
    const html = renderToStaticMarkup(
      createElement(ChatWorkspaceWelcome, { onSelectPrompt: () => undefined })
    )
    const promptButtons = [...html.matchAll(/<button.*?<\/button>/gs)]

    expect(html).toContain('Let&#x27;s explore the workspace')
    expect(html).toContain('What could you build?')
    expect(promptButtons).toHaveLength(1)
    expect(promptButtons[0]?.[0]).toContain('<svg')
    expect(promptButtons[0]?.[0]).not.toContain('grid')
    expect(promptButtons[0]?.[0]).not.toContain('rotate')
  })

  test('disables the analysis prompt when sending is unavailable', () => {
    const html = renderToStaticMarkup(
      createElement(ChatWorkspaceWelcome, {
        disabled: true,
        onSelectPrompt: () => undefined
      })
    )

    expect(html.match(/<button.*?<\/button>/s)?.[0]).toContain('disabled=""')
  })

  test('keeps analysis instructions in hidden message context', () => {
    expect(workspaceAnalysisPrompt).toMatchObject({
      label: 'What could you build?',
      prompt:
        'Analyze this workspace and suggest useful widgets and views moi can build based on its content'
    })

    const html = renderToStaticMarkup(
      createElement(ChatWorkspaceWelcome, { onSelectPrompt: () => undefined })
    )
    expect(html).not.toContain('Wait for me to choose')

    const context = renderMoiContext({
      activeTab: 'agent',
      directives: [...workspaceAnalysisPrompt.context]
    })
    expect(context).toContain('Explore the existing workspace files')
    expect(context).toContain('which content informed your ideas')
    expect(context).toContain('Wait for me to choose before building anything')
  })
})
