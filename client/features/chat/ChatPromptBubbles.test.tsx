import { Children, type ReactElement, type ReactNode } from 'react'

import { IconPiano } from '@tabler/icons-react'
import { describe, expect, mock, test } from 'bun:test'

import { ChatPromptBubbles, type ChatPromptBubble } from '@/client/features/chat/ChatPromptBubbles'

describe('ChatPromptBubbles', () => {
  test('returns the complete prompt when selected', () => {
    const prompt: ChatPromptBubble = {
      label: 'Build a synthesizer',
      prompt: 'Build me a synthesizer',
      context: ['Use the browser audio APIs.', 'Save recordings in the workspace.'],
      icon: IconPiano
    }
    const onSelect = mock(() => undefined)
    const root = ChatPromptBubbles({ prompts: [prompt], onSelect }) as ReactElement<{
      children: ReactNode
    }>
    const button = Children.toArray(root.props.children)[0] as ReactElement<{
      onClick: () => void
    }>

    button.props.onClick()

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith(prompt)
  })
})
