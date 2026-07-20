import { IconX } from '@tabler/icons-react'

import { WorkspaceAgentSelector, workspaceAgentDescription } from './WorkspaceAgentSelector'
import { Button } from '@/client/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle
} from '@/client/components/ui/dialog'
import type { WorkspaceType } from '@/lib/types'

type WorkspaceImportAgentStepProps = {
  types: WorkspaceType[]
  selectedType: WorkspaceType
  isPending: boolean
  errorMessage?: string
  onTypeChange: (type: WorkspaceType) => void
  onCancel: () => void
  onSubmit: () => void
}

export function WorkspaceImportAgentStep({
  types,
  selectedType,
  isPending,
  errorMessage,
  onTypeChange,
  onCancel,
  onSubmit
}: WorkspaceImportAgentStepProps) {
  const options = types.map(type => ({
    type,
    description: workspaceAgentDescription[type]
  }))

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-0.5 pr-8">
        <DialogTitle>Import from this computer</DialogTitle>
        <DialogDescription>
          Choose which agent moi should use to build your workspace
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
        <Button onClick={onSubmit} disabled={isPending}>
          {isPending ? 'Adding…' : 'Add workspace'}
        </Button>
      </div>
    </div>
  )
}

type WorkspaceImportDialogProps = {
  open: boolean
  types: WorkspaceType[]
  selectedType: WorkspaceType
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
  types,
  selectedType,
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
          types={types}
          selectedType={selectedType}
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
