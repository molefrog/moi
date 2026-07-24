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
      variant="secondary"
      size="sm"
      disabled={disabled}
      onClick={() => onSelect(prompt)}
      className={cn(
        'h-auto items-start justify-start gap-2 rounded-lg p-3 px-4 text-left leading-snug whitespace-normal',
        'hover:bg-accent',
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
    <div className="grid w-full grid-cols-1 gap-3 py-2 sm:grid-cols-3">
      {prompts.map((prompt, index) => {
        return (
          <ChatPromptBubble
            key={prompt.prompt}
            prompt={prompt}
            disabled={disabled}
            onSelect={onSelect}
            className={cn(
              'h-full w-full',
              index === 0 && 'translate-y-3 rotate-3 hover:translate-y-2.5',
              index === 1 && 'translate-y-0 -rotate-1 hover:-translate-y-0.5',
              index === 2 && 'translate-y-3 -rotate-4 hover:translate-y-2.5'
            )}
          />
        )
      })}
    </div>
  )
}
