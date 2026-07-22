import type { TablerIcon } from '@tabler/icons-react'

import { Button } from '@/client/components/ui/button'
import { cn } from '@/client/lib/cn'

export type ChatPromptBubble = {
  label: string
  prompt: string
  context: readonly string[]
  icon: TablerIcon
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
        const Icon = prompt.icon

        return (
          <Button
            key={prompt.prompt}
            type="button"
            variant="secondary"
            size="sm"
            disabled={disabled}
            onClick={() => onSelect(prompt)}
            className={cn(
              'h-full w-full items-start justify-start gap-2 rounded-lg p-3 pl-4 text-left leading-snug whitespace-normal',
              'hover:bg-accent',
              index === 0 && 'translate-y-3 rotate-3 hover:translate-y-2.5',
              index === 1 && 'translate-y-0 -rotate-1 hover:-translate-y-0.5',
              index === 2 && 'translate-y-3 -rotate-4 hover:translate-y-2.5'
            )}
          >
            <Icon stroke={2} aria-hidden className="mt-0.5 text-muted-foreground" />
            <span>{prompt.label}</span>
          </Button>
        )
      })}
    </div>
  )
}
