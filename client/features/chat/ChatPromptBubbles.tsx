import { Button } from '@/client/components/ui/button'

export type ChatPromptBubble = {
  label: string
  prompt: string
}

type ChatPromptBubblesProps = {
  prompts: readonly ChatPromptBubble[]
  disabled?: boolean
  onSelect: (prompt: string) => void
}

export function ChatPromptBubbles({ prompts, disabled = false, onSelect }: ChatPromptBubblesProps) {
  return (
    <div className="flex flex-wrap items-start gap-2">
      {prompts.map(prompt => (
        <Button
          key={prompt.prompt}
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => onSelect(prompt.prompt)}
          className="h-auto min-h-8 max-w-full shrink justify-start rounded-lg px-3 py-2 text-left leading-snug whitespace-normal shadow-sm hover:shadow-md"
        >
          {prompt.label}
        </Button>
      ))}
    </div>
  )
}
