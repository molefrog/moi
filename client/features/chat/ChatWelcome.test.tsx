import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { describe, expect, test } from 'bun:test'

import { CHAT_WELCOME_PROMPTS, ChatWelcome } from '@/client/features/chat/ChatWelcome'
import { renderMoiContext } from '@/lib/moi-context'

function renderedParagraphs(html: string): string[] {
  return [...html.matchAll(/<p>(.*?)<\/p>/gs)].map(match =>
    match[1]
      .replace(/<svg.*?<\/svg>/gs, '')
      .replace(/<[^>]+>/g, '')
      .replaceAll('&#x27;', "'")
      .replace(/\s+/g, ' ')
      .trim()
  )
}

describe('ChatWelcome', () => {
  test('keeps the canonical welcome copy exact', () => {
    const html = renderToStaticMarkup(
      createElement(ChatWelcome, { onSelectPrompt: () => undefined })
    )

    expect(renderedParagraphs(html)).toEqual([
      'moi is the visual workspace for you and your agent.',
      "It can grow and adapt to the work you're doing. Just describe what you want, and the agent will build small apps in the workspace.",
      'You start chatting with Agent, where you can ask questions and build anything. Widgets are small apps that surface information and provide quick actions. For more complex tools, you can build Views that open in their own tabs. Scratchpad is a shared canvas for exploring and shaping ideas with your agent.',
      'Give it a try:'
    ])
  })

  test('renders four inline icons and three prompt bubbles with icons', () => {
    const html = renderToStaticMarkup(
      createElement(ChatWelcome, { onSelectPrompt: () => undefined })
    )

    const welcomeTerms = [...html.matchAll(/<strong.*?<\/strong>/gs)]
    const promptButtons = [...html.matchAll(/<button.*?<\/button>/gs)]

    expect(welcomeTerms).toHaveLength(4)
    expect(welcomeTerms.every(([term]) => term.includes('<svg'))).toBe(true)
    expect(promptButtons).toHaveLength(3)
    expect(promptButtons.every(([button]) => button.includes('<svg'))).toBe(true)
    expect(html).toContain('rounded-lg')
    expect(html).toContain('whitespace-normal')
    expect(html).toContain('What&#x27;s the weather?')
    expect(html).toContain('Build a fun synthesizer')
    expect(html).toContain('Make a job tracker')
  })

  test('keeps visible requests separate from detailed build context', () => {
    expect(CHAT_WELCOME_PROMPTS.map(({ label, prompt }) => ({ label, prompt }))).toEqual([
      {
        label: "What's the weather?",
        prompt:
          "Build me a set of weather widgets that surface current conditions, today's hourly forecast, and a simple weekly outlook at a glance"
      },
      {
        label: 'Build a fun synthesizer',
        prompt:
          'Build me a view with a simple, playful synthesizer featuring a keyboard, five sound controls, and the ability to record, save, and load music files from the workspace'
      },
      {
        label: 'Make a job tracker',
        prompt:
          'Build me a view with a visual job search board where I can add opportunities by pasting a job link, automatically extract the details, move opportunities through stages, and keep notes and related files in the workspace'
      }
    ])

    const [weather, synthesizer, jobTracker] = CHAT_WELCOME_PROMPTS.map(prompt =>
      prompt.context.join(' ')
    )
    expect(weather).toContain('Open-Meteo')
    expect(weather).toContain('three separate widgets')
    expect(synthesizer).toContain('computer-keyboard controls')
    expect(synthesizer).toContain('JSON music files')
    expect(jobTracker).toContain('Saved, Applied, Interviewing, Offer, and Closed')
    expect(jobTracker).toContain('workspace-local JSON file')

    const html = renderToStaticMarkup(
      createElement(ChatWelcome, { onSelectPrompt: () => undefined })
    )
    expect(html).not.toContain('Open-Meteo')
    expect(html).not.toContain('workspace-local JSON file')

    const context = renderMoiContext({
      activeTab: 'agent',
      directives: [...CHAT_WELCOME_PROMPTS[0].context]
    })
    expect(context).toContain('# This message only')
    expect(context).toContain('Open-Meteo')
    expect(context).toContain('smoke-test the shared weather function')
  })
})
