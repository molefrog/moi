import { IconX } from '@tabler/icons-react'

import { WorkspaceAgentSelector } from './WorkspaceAgentSelector'
import { workspaceAgentIsDisabled, workspaceAgentOptions } from './workspace-agent-options'
import { Button } from '@/client/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle
} from '@/client/components/ui/dialog'
import type { HarnessAvailability, WorkspaceType } from '@/lib/types'

type WorkspaceImportAgentStepProps = {
  detectedTypes: WorkspaceType[]
  selectedType: WorkspaceType
  availability?: Partial<Record<WorkspaceType, HarnessAvailability>>
  isPending: boolean
  errorMessage?: string
  onTypeChange: (type: WorkspaceType) => void
  onCancel: () => void
  onSubmit: () => void
}

export function WorkspaceImportAgentStep({
  detectedTypes,
  selectedType,
  availability,
  isPending,
  errorMessage,
  onTypeChange,
  onCancel,
  onSubmit
}: WorkspaceImportAgentStepProps) {
  const options = workspaceAgentOptions({
    availability,
    openClawSelectable: detectedTypes.includes('openclaw')
  })
  const selectedUnavailable = workspaceAgentIsDisabled(options, selectedType)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-0.5 pr-8">
        <DialogTitle>Import from this computer</DialogTitle>
        <DialogDescription>
          Choose which agent moi will use to build your workspace
        </DialogDescription>
      </div>

      <WorkspaceAgentSelector
        options={options}
        selectedType={selectedType}
        onTypeChange={onTypeChange}
      />

      {errorMessage && (
        <p role="alert" className="text-xs text-destructive">
          {errorMessage}
        </p>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={isPending}>
          Cancel
        </Button>
        <Button onClick={onSubmit} disabled={isPending || selectedUnavailable}>
          {isPending ? 'Adding…' : 'Add workspace'}
        </Button>
      </div>
    </div>
  )
}

type WorkspaceImportDialogProps = {
  open: boolean
  detectedTypes: WorkspaceType[]
  selectedType: WorkspaceType
  availability?: Partial<Record<WorkspaceType, HarnessAvailability>>
  isPending: boolean
  errorMessage?: string
  onOpenChange: (open: boolean) => void
  onOpenChangeComplete: (open: boolean) => void
  onTypeChange: (type: WorkspaceType) => void
  onCancel: () => void
  onSubmit: () => void
}

export function WorkspaceImportDialog({
  open,
  detectedTypes,
  selectedType,
  availability,
  isPending,
  errorMessage,
  onOpenChange,
  onOpenChangeComplete,
  onTypeChange,
  onCancel,
  onSubmit
}: WorkspaceImportDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} onOpenChangeComplete={onOpenChangeComplete}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-lg p-6">
        <DialogClose
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Close"
              className="absolute top-4 right-4"
              disabled={isPending}
            >
              <IconX stroke={1.75} />
            </Button>
          }
        />
        <WorkspaceImportAgentStep
          detectedTypes={detectedTypes}
          selectedType={selectedType}
          availability={availability}
          isPending={isPending}
          errorMessage={errorMessage}
          onTypeChange={onTypeChange}
          onCancel={onCancel}
          onSubmit={onSubmit}
        />
      </DialogContent>
    </Dialog>
  )
}
