import { Children, type ReactElement, type ReactNode } from 'react'

import { IconPiano } from '@tabler/icons-react'
import { describe, expect, mock, test } from 'bun:test'

import {
  ChatPromptBubble,
  ChatPromptBubbles,
  type ChatPromptBubble as ChatPrompt
} from '@/client/features/chat/ChatPromptBubbles'

const prompt: ChatPrompt = {
  label: 'Build a synthesizer',
  prompt: 'Build me a synthesizer',
  context: ['Use the browser audio APIs.', 'Save recordings in the workspace.'],
  icon: IconPiano
}

describe('ChatPromptBubbles', () => {
  test('the singular bubble returns the complete prompt without layout styles', () => {
    const onSelect = mock(() => undefined)
    const bubble = ChatPromptBubble({ prompt, onSelect }) as ReactElement<{
      className?: string
      onClick: () => void
    }>

    bubble.props.onClick()

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith(prompt)
    expect(bubble.props.className).not.toContain('grid')
    expect(bubble.props.className).not.toContain('rotate')
    expect(bubble.props.className).not.toContain('translate')
  })

  test('the plural component owns grid and rotation styles', () => {
    const root = ChatPromptBubbles({
      prompts: [prompt],
      onSelect: () => undefined
    }) as ReactElement<{
      children: ReactNode
      className?: string
    }>
    const bubble = Children.toArray(root.props.children)[0] as ReactElement<{
      className?: string
    }>

    expect(root.props.className).toContain('grid')
    expect(bubble.type).toBe(ChatPromptBubble)
    expect(bubble.props.className).toContain('rotate-3')
    expect(bubble.props.className).toContain('translate-y-3')
  })
})
