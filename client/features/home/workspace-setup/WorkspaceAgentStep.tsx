import { type ReactNode, useEffect } from 'react'

import { IconCircleCheckFilled } from '@tabler/icons-react'

import { Button } from '@/client/components/ui/button'
import { workspaceProviderIcon } from '@/client/components/shared/WorkspaceIcon'
import { DialogDescription, DialogTitle } from '@/client/components/ui/dialog'
import { Skeleton } from '@/client/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/client/components/ui/tooltip'
import { workspaceTypeLabel } from '@/client/features/home/workspace-presentation'
import { cn } from '@/client/lib/cn'
import { useUiStore } from '@/client/store/ui'
import type { WorkspaceType } from '@/lib/types'

import {
  resolveWorkspaceAgentSelection,
  type WorkspaceAgentOption
} from './workspace-agent-options'

const WORKSPACE_AGENT_DESCRIPTION = 'Choose which agent moi will use to build your workspace'
type WorkspaceAgentStepProps = {
  title: string
  selectedType: WorkspaceType
  options: WorkspaceAgentOption[]
  isLoading?: boolean
  isPending: boolean
  errorMessage?: string
  emptyMessage?: string
  secondaryAction: ReactNode
  primaryLabel: string
  pendingLabel?: string
  onTypeChange: (type: WorkspaceType) => void
  onSubmit: () => void
}

export function WorkspaceAgentStep({
  title,
  selectedType,
  options,
  isLoading = false,
  isPending,
  errorMessage,
  emptyMessage,
  secondaryAction,
  primaryLabel,
  pendingLabel,
  onTypeChange,
  onSubmit
}: WorkspaceAgentStepProps) {
  const hasSentMessageFromMoi = useUiStore(state => state.hasSentMessageFromMoi)
  const selectableType = resolveWorkspaceAgentSelection(options, selectedType)
  const selectedUnavailable = selectableType !== selectedType
  const subscriptionTip =
    selectableType === 'claude-code'
      ? 'Tip: you can use your existing Claude subscription in moi'
      : selectableType === 'codex'
        ? 'Tip: you can use your existing ChatGPT subscription in moi'
        : undefined

  useEffect(() => {
    if (!isPending && selectableType && selectedUnavailable) onTypeChange(selectableType)
  }, [isPending, onTypeChange, selectableType, selectedUnavailable])

  return (
    <div className="flex min-w-[min(22rem,calc(100vw-5rem))] flex-col gap-5">
      <div className="flex w-0 min-w-full flex-col gap-0.5 pr-8">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{WORKSPACE_AGENT_DESCRIPTION}</DialogDescription>
      </div>

      <div className="flex flex-col gap-4">
        {isLoading ? (
          <div
            className="flex flex-wrap justify-center gap-2"
            role="status"
            aria-label="Checking installed agents"
          >
            <Skeleton className="h-32 min-w-32 flex-1" />
            <Skeleton className="h-32 min-w-32 flex-1" />
          </div>
        ) : (
          <WorkspaceAgentSelector
            options={options}
            selectedType={selectedUnavailable ? undefined : selectedType}
            onTypeChange={onTypeChange}
          />
        )}
        {!hasSentMessageFromMoi && subscriptionTip && (
          <p className="w-0 min-w-full text-sm text-muted-foreground">{subscriptionTip}</p>
        )}
      </div>

      {errorMessage && (
        <p role="alert" className="w-0 min-w-full text-xs text-destructive">
          {errorMessage}
        </p>
      )}

      {emptyMessage && !selectableType && !isPending && !errorMessage && (
        <p className="w-0 min-w-full text-sm text-muted-foreground">{emptyMessage}</p>
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
    <div role="group" aria-label="Agent" className="flex flex-wrap justify-center gap-2">
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
        'relative flex h-32 min-w-32 flex-1 flex-col items-start justify-between gap-6 rounded-xl bg-card p-4 text-left ring-1 ring-border transition-opacity outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
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
      <TooltipContent className="max-w-[calc(100vw-2rem)] leading-5 sm:max-w-96">
        <span className="text-center">
          {option.disabledReason}
          {option.disabledCommand && (
            <>
              <br />
              <code className="rounded-xs bg-accent px-1 py-0.5 font-mono wrap-anywhere">
                {option.disabledCommand}
              </code>
            </>
          )}
        </span>
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
