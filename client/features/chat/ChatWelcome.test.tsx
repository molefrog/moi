import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { describe, expect, test } from 'bun:test'

import { ChatWelcome } from '@/client/features/chat/ChatWelcome'

function renderedParagraphs(html: string): string[] {
  return [...html.matchAll(/<p>(.*?)<\/p>/gs)].map(match =>
    match[1]
      .replace(/<svg.*?<\/svg>/gs, '')
      .replace(/<[^>]+>/g, '')
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
      'moi is the UI for your AI.',
      'Build functional, reusable interfaces for your workspace. moi makes it easy to create apps that work with your data, manage workspace files, connect to external services, and adapt to your specific needs. Describe what you want, and your agent builds it directly inside the workspace.',
      'You start in Chat, where you can build with your agent and ask any questions. Widgets are small apps on the Widgets tab that surface information and provide quick actions. For more complex tools, you can build Views that open in their own tabs. Scratchpad is a shared canvas for exploring and shaping ideas with your agent.',
      'As your needs evolve, you can add new tools, refine existing ones, and keep shaping the workspace around the way you work. You can also use your existing Claude or ChatGPT subscription directly in moi.',
      'What would you like to create first?'
    ])
  })

  test('renders four inline icons and three floating prompt bubbles', () => {
    const html = renderToStaticMarkup(
      createElement(ChatWelcome, { onSelectPrompt: () => undefined })
    )

    expect((html.match(/<svg/g) ?? []).length).toBe(4)
    expect((html.match(/<button/g) ?? []).length).toBe(3)
    expect(html).toContain('rounded-lg')
    expect(html).toContain('shadow-sm')
    expect(html).toContain('whitespace-normal')
    expect(html).toContain('“Track my daily habits.”')
    expect(html).not.toContain('<li>')
  })
})
