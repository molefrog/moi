import { IconCircleCheckFilled } from '@tabler/icons-react'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/client/components/ui/tooltip'
import { cn } from '@/client/lib/cn'
import {
  WorkspaceTypeIcon,
  workspaceTypeLabel
} from '@/client/features/home/workspace-presentation'
import type { WorkspaceType } from '@/lib/types'

export const workspaceAgentDescription: Record<WorkspaceType, string> = {
  'claude-code': 'By Anthropic',
  codex: 'By OpenAI',
  openclaw: 'Open-source'
}

export type WorkspaceAgentOption = {
  type: WorkspaceType
  description: string
  disabled?: boolean
  lockedDescription?: string
}

type WorkspaceAgentSelectorProps = {
  options: WorkspaceAgentOption[]
  selectedType: WorkspaceType
  onTypeChange: (type: WorkspaceType) => void
}

export function WorkspaceAgentSelector({
  options,
  selectedType,
  onTypeChange
}: WorkspaceAgentSelectorProps) {
  return (
    <div
      role="group"
      aria-label="Agent"
      className={cn('grid gap-2', options.length > 2 ? 'grid-cols-3' : 'grid-cols-2')}
    >
      {options.map(option => (
        <WorkspaceAgentOptionButton
          key={option.type}
          option={option}
          selected={selectedType === option.type}
          onSelect={onTypeChange}
        />
      ))}
    </div>
  )
}

type WorkspaceAgentOptionButtonProps = {
  option: WorkspaceAgentOption
  selected: boolean
  onSelect: (type: WorkspaceType) => void
}

function WorkspaceAgentOptionButton({
  option,
  selected,
  onSelect
}: WorkspaceAgentOptionButtonProps) {
  const showLockedTooltip = Boolean(option.lockedDescription)
  const button = (
    <button
      type="button"
      disabled={option.disabled && !showLockedTooltip}
      aria-disabled={option.disabled || undefined}
      onClick={event => {
        if (option.disabled) {
          event.preventDefault()
          return
        }
        onSelect(option.type)
      }}
      aria-pressed={selected}
      className={cn(
        'relative flex w-full flex-col items-start justify-between gap-6 rounded-lg bg-card p-4 text-left ring-1 ring-border transition-shadow outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        !selected && !option.disabled && 'cursor-pointer',
        option.disabled && 'cursor-not-allowed opacity-50'
      )}
    >
      <span className="relative inline-flex">
        <WorkspaceTypeIcon type={option.type} className="size-10" />
        {selected && (
          <IconCircleCheckFilled
            size={20}
            stroke={1.5}
            aria-hidden="true"
            className="absolute -top-1.5 -right-1.5"
          />
        )}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-medium text-foreground">
          {workspaceTypeLabel[option.type]}
        </span>
        <span className="text-xs leading-4 text-muted-foreground">{option.description}</span>
      </span>
    </button>
  )

  if (!showLockedTooltip) return button

  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipContent className="max-w-64 text-center whitespace-pre-line">
        {option.lockedDescription}
      </TooltipContent>
    </Tooltip>
  )
}
