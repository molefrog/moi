import type { TablerIcon } from '@tabler/icons-react'

import { Button } from '@/client/components/ui/button'
import { cn } from '@/client/lib/cn'

export type ChatPromptBubble = {
  label: string
  prompt: string
  context: readonly string[]
  icon: TablerIcon
}

type ChatPromptBubbleProps = {
  className?: string
  prompt: ChatPromptBubble
  disabled?: boolean
  onSelect: (prompt: ChatPromptBubble) => void
}

export function ChatPromptBubble({
  className,
  prompt,
  disabled = false,
  onSelect
}: ChatPromptBubbleProps) {
  const Icon = prompt.icon

  return (
    <Button
      type="button"
      size="sm"
      disabled={disabled}
      onClick={() => onSelect(prompt)}
      className={cn(
        'h-auto items-start justify-start gap-2 rounded-lg p-2 px-3 text-left leading-snug whitespace-normal',
        className
      )}
    >
      <Icon stroke={2} aria-hidden className="mt-0.5 text-muted-foreground" />
      <span>{prompt.label}</span>
    </Button>
  )
}

type ChatPromptBubblesProps = {
  prompts: readonly ChatPromptBubble[]
  disabled?: boolean
  onSelect: (prompt: ChatPromptBubble) => void
}

export function ChatPromptBubbles({ prompts, disabled = false, onSelect }: ChatPromptBubblesProps) {
  return (
    <div className="row-gap-2 grid w-full grid-cols-1 gap-x-3 gap-y-2 py-2 @md:grid-cols-3">
      {prompts.map((prompt, index) => {
        return (
          <ChatPromptBubble
            key={prompt.prompt}
            prompt={prompt}
            disabled={disabled}
            onSelect={onSelect}
            className={cn(
              'h-full w-fit @md:w-full',
              index === 0 && '@md:translate-y-3 @md:rotate-3 @md:hover:translate-y-2.5',
              index === 1 && '@md:-rotate-1',
              index === 2 && '@md:translate-y-3 @md:-rotate-4 @md:hover:translate-y-2.5'
            )}
          />
        )
      })}
    </div>
  )
}
