import { HarnessSelector } from '@/client/features/harness/harness-selector'
import { type ReactNode, useEffect } from 'react'

import { Button } from '@/client/components/ui/button'
import { DialogDescription, DialogTitle } from '@/client/components/ui/dialog'
import { Skeleton } from '@/client/components/ui/skeleton'
import type { WorkspaceType } from '@/lib/types'

import {
  resolveWorkspaceAgentSelection,
  type WorkspaceAgentOption
} from './workspace-agent-options'

const WORKSPACE_AGENT_DESCRIPTION = 'Choose the agent to build the workspace'
type WorkspaceAgentSelectorProps = {
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

export function WorkspaceAgentSelector({
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
}: WorkspaceAgentSelectorProps) {
  const selectableType = resolveWorkspaceAgentSelection(options, selectedType)
  const selectedUnavailable = selectableType !== selectedType

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
          <HarnessSelector
            disabled={isPending}
            options={options}
            selectedType={selectedUnavailable ? undefined : selectedType}
            onTypeChange={onTypeChange}
          />
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
