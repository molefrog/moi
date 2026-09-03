import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { describe, expect, test } from 'bun:test'

import { CHAT_WELCOME_PROMPTS, ChatEmptyState } from '@/client/features/chat/ChatEmptyState'
import { renderMoiContext } from '@/lib/moi-context'

function renderWelcome(disabled = false): string {
  return renderToStaticMarkup(
    createElement(ChatEmptyState, {
      agent: 'boxy',
      kind: 'welcome',
      hasWorkspaceApplets: false,
      disabled,
      onSelectPrompt: () => undefined,
      onNavigate: () => undefined
    })
  )
}

function renderedParagraphs(html: string): string[] {
  return [...html.matchAll(/<p(?: [^>]*)?>(.*?)<\/p>/gs)].map(match =>
    match[1]
      .replace(/<svg.*?<\/svg>/gs, '')
      .replace(/<[^>]+>/g, '')
      .replaceAll('&#x27;', "'")
      .replace(/\s+/g, ' ')
      .trim()
  )
}

describe('WelcomeState', () => {
  test('keeps the canonical welcome copy exact', () => {
    const html = renderWelcome()

    expect(renderedParagraphs(html)).toEqual([
      "moi is the visual workspace for you and your agent. It grows and adapts to the work you're doing.",
      'Ask agent to build widgets on Overview that surface information and quick actions, or entire Views for more complex tools. Use Scratchpad for exploring and shaping ideas with your agent.',
      'Try an example:'
    ])
  })

  test('renders three inline tab actions and three prompt bubbles with icons', () => {
    const html = renderWelcome()

    const welcomeTerms = [...html.matchAll(/<button[^>]+data-welcome-destination.*?<\/button>/gs)]
    const promptButtons = [
      ...html.matchAll(/<button(?![^>]+data-welcome-destination).*?<\/button>/gs)
    ]

    expect(welcomeTerms).toHaveLength(3)
    expect(welcomeTerms.every(([term]) => term.includes('<svg'))).toBe(true)
    expect(html).toContain('data-welcome-destination="overview"')
    expect(html).toContain('data-welcome-destination="views"')
    expect(html).toContain('data-welcome-destination="scratchpad"')
    expect(promptButtons).toHaveLength(3)
    expect(promptButtons.every(([button]) => button.includes('<svg'))).toBe(true)
    expect(html).toContain('Check the weather')
    expect(html).toContain('Build a playful synthesizer')
    expect(html).toContain('Track my finances')
  })

  test('disables every prompt when sending is unavailable', () => {
    const html = renderWelcome(true)
    const promptButtons = [
      ...html.matchAll(/<button(?![^>]+data-welcome-destination).*?<\/button>/gs)
    ]

    expect(promptButtons).toHaveLength(3)
    expect(promptButtons.every(([button]) => button.includes('disabled=""'))).toBe(true)
  })

  test('keeps visible requests separate from detailed build context', () => {
    expect(CHAT_WELCOME_PROMPTS.map(({ label, prompt }) => ({ label, prompt }))).toEqual([
      {
        label: 'Check the weather',
        prompt:
          "Build me a set of weather widgets that surface current conditions, today's hourly forecast, and a simple weekly outlook at a glance"
      },
      {
        label: 'Track my finances',
        prompt:
          'Build me a personal finance view for tracking income, expenses, monthly budgets, spending trends, and savings, with an agent action that can add sample transactions'
      },
      {
        label: 'Build a playful synthesizer',
        prompt:
          'Build me a view with a simple, playful synthesizer featuring a keyboard, five sound controls, and the ability to record, save, and load music files from the workspace'
      }
    ])

    const [weather, financeTracker, synthesizer] = CHAT_WELCOME_PROMPTS.map(prompt =>
      prompt.context.join(' ')
    )
    expect(weather).toContain('Open-Meteo')
    expect(weather).toContain('three separate widgets')
    expect(synthesizer).toContain('computer-keyboard controls')
    expect(synthesizer).toContain('JSON music files')
    expect(financeTracker).toContain('workspace-local SQLite database')
    expect(financeTracker).toContain('integer cents')
    expect(financeTracker).toContain('sendChatMessage')
    for (const prompt of CHAT_WELCOME_PROMPTS) {
      expect(prompt.context.at(-1)).toBe(
        'Keep the final reply brief and user-facing. Do not include file or storage links, file paths, or bundle, test, and runtime-log summaries.'
      )
    }

    const html = renderWelcome()
    expect(html).not.toContain('Open-Meteo')
    expect(html).not.toContain('workspace-local SQLite database')

    const context = renderMoiContext({
      activeTab: 'agent',
      directives: [...CHAT_WELCOME_PROMPTS[0].context]
    })
    expect(context).toContain('# This message only')
    expect(context).toContain('Open-Meteo')
    expect(context).toContain('smoke-test the shared weather function')
    expect(context).toContain('Do not include file or storage links')
  })
})
