import { type ReactNode, useEffect } from 'react'

import { IconCircleCheckFilled } from '@tabler/icons-react'

import { Button } from '@/client/components/ui/button'
import { DialogDescription, DialogTitle } from '@/client/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/client/components/ui/tooltip'
import {
  workspaceProviderIcon,
  workspaceTypeLabel
} from '@/client/features/home/workspace-presentation'
import { cn } from '@/client/lib/cn'
import { WORKSPACE_TYPE_ORDER } from '@/lib/workspace-types'
import type { HarnessAvailability, WorkspaceType } from '@/lib/types'

const WORKSPACE_AGENT_DESCRIPTION = 'Choose which agent moi will use to build your workspace'
const OPENCLAW_LOCKED_DESCRIPTION =
  'Initialize OpenClaw in the folder\nmanually, then import it to moi'

const workspaceAgentDescription: Record<WorkspaceType, string> = {
  'claude-code': 'By Anthropic',
  codex: 'By OpenAI',
  openclaw: 'Open-source'
}

export type WorkspaceAgentOption = {
  type: WorkspaceType
  description: string
  disabled: boolean
  disabledReason?: string
}

type WorkspaceAgentOptionsInput = {
  availability?: Partial<Record<WorkspaceType, HarnessAvailability>>
  detectedTypes?: WorkspaceType[]
}

export function getWorkspaceAgentOptions({
  availability,
  detectedTypes = []
}: WorkspaceAgentOptionsInput): WorkspaceAgentOption[] {
  return WORKSPACE_TYPE_ORDER.map(type => {
    const state = availability?.[type]
    const unavailableReason = state?.available === false ? state.reason : undefined
    const openClawReason =
      type === 'openclaw' && !detectedTypes.includes(type) ? OPENCLAW_LOCKED_DESCRIPTION : undefined
    const disabledReason = unavailableReason ?? openClawReason

    return {
      type,
      description: workspaceAgentDescription[type],
      disabled: Boolean(disabledReason),
      ...(disabledReason ? { disabledReason } : {})
    }
  })
}

export function resolveWorkspaceAgentSelection(
  options: WorkspaceAgentOption[],
  selectedType: WorkspaceType
): WorkspaceType | undefined {
  const selected = options.find(option => option.type === selectedType)
  if (selected && !selected.disabled) return selected.type
  return options.find(option => !option.disabled)?.type
}

type WorkspaceAgentStepProps = {
  title: string
  selectedType: WorkspaceType
  detectedTypes?: WorkspaceType[]
  availability?: Partial<Record<WorkspaceType, HarnessAvailability>>
  isPending: boolean
  errorMessage?: string
  secondaryAction: ReactNode
  primaryLabel: string
  pendingLabel?: string
  onTypeChange: (type: WorkspaceType) => void
  onSubmit: () => void
}

export function WorkspaceAgentStep({
  title,
  selectedType,
  detectedTypes,
  availability,
  isPending,
  errorMessage,
  secondaryAction,
  primaryLabel,
  pendingLabel,
  onTypeChange,
  onSubmit
}: WorkspaceAgentStepProps) {
  const options = getWorkspaceAgentOptions({ availability, detectedTypes })
  const selectableType = resolveWorkspaceAgentSelection(options, selectedType)
  const selectedUnavailable = selectableType !== selectedType

  useEffect(() => {
    if (selectableType && selectedUnavailable) onTypeChange(selectableType)
  }, [onTypeChange, selectableType, selectedUnavailable])

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-0.5 pr-8">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{WORKSPACE_AGENT_DESCRIPTION}</DialogDescription>
      </div>

      <WorkspaceAgentSelector
        options={options}
        selectedType={selectedUnavailable ? undefined : selectedType}
        onTypeChange={onTypeChange}
      />

      {errorMessage && (
        <p role="alert" className="text-xs text-destructive">
          {errorMessage}
        </p>
      )}

      <div className="flex items-center justify-end gap-2">
        {secondaryAction}
        <Button onClick={onSubmit} disabled={isPending || selectedUnavailable}>
          {isPending && pendingLabel ? pendingLabel : primaryLabel}
        </Button>
      </div>
    </div>
  )
}

type WorkspaceAgentSelectorProps = {
  options: WorkspaceAgentOption[]
  selectedType?: WorkspaceType
  onTypeChange: (type: WorkspaceType) => void
}

function WorkspaceAgentSelector({
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
  const showDisabledTooltip = Boolean(option.disabledReason)
  const button = (
    <button
      type="button"
      disabled={option.disabled && !showDisabledTooltip}
      aria-disabled={option.disabled || undefined}
      aria-pressed={selected}
      onClick={event => {
        if (option.disabled) {
          event.preventDefault()
          return
        }
        onSelect(option.type)
      }}
      className={cn(
        'relative flex w-full flex-col items-start justify-between gap-6 rounded-lg bg-card p-4 text-left ring-1 ring-border transition-opacity outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        !selected && 'opacity-70',
        !selected && !option.disabled && 'cursor-pointer hover:opacity-100',
        option.disabled && 'cursor-not-allowed'
      )}
    >
      <span className="relative inline-flex">
        <WorkspaceAgentIcon type={option.type} />
        {selected && (
          <IconCircleCheckFilled
            size={16}
            stroke={1.75}
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

  if (!showDisabledTooltip) return button

  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipContent className="max-w-64 text-center whitespace-pre-line">
        {option.disabledReason}
      </TooltipContent>
    </Tooltip>
  )
}

type WorkspaceAgentIconProps = {
  type: WorkspaceType
}

function WorkspaceAgentIcon({ type }: WorkspaceAgentIconProps) {
  return <img src={workspaceProviderIcon[type]} alt="" className="size-8 shrink-0" />
}
