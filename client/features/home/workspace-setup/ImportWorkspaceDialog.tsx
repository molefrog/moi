import { useState } from 'react'

import { Button } from '@/client/components/ui/button'
import { Dialog } from '@/client/components/ui/dialog'
import type { HarnessAvailability, WorkspaceType } from '@/lib/types'

import { WorkspaceAgentStep } from './WorkspaceAgentStep'
import { WorkspaceDialogContent } from './WorkspaceDialogContent'
import type { WorkspaceImportChoice } from './useWorkspaceImport'

type ImportWorkspaceStepProps = {
  choice: WorkspaceImportChoice
  availability?: Partial<Record<WorkspaceType, HarnessAvailability>>
  isPending: boolean
  errorMessage?: string
  onTypeChange: (type: WorkspaceType) => void
  onCancel: () => void
  onSubmit: () => void
}

export function ImportWorkspaceStep({
  choice,
  availability,
  isPending,
  errorMessage,
  onTypeChange,
  onCancel,
  onSubmit
}: ImportWorkspaceStepProps) {
  return (
    <WorkspaceAgentStep
      title="Import from this computer"
      selectedType={choice.selectedType}
      detectedTypes={choice.workspace.types}
      availability={availability}
      isPending={isPending}
      errorMessage={errorMessage}
      secondaryAction={
        <Button variant="secondary" onClick={onCancel} disabled={isPending}>
          Cancel
        </Button>
      }
      primaryLabel="Add workspace"
      pendingLabel="Adding…"
      onTypeChange={onTypeChange}
      onSubmit={onSubmit}
    />
  )
}

type ImportWorkspaceDialogProps = Omit<ImportWorkspaceStepProps, 'onCancel'> & {
  onReset: () => void
}

export function ImportWorkspaceDialog({
  choice,
  availability,
  isPending,
  errorMessage,
  onTypeChange,
  onSubmit,
  onReset
}: ImportWorkspaceDialogProps) {
  const [open, setOpen] = useState(true)

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && isPending) return
    setOpen(nextOpen)
  }

  function handleOpenChangeComplete(nextOpen: boolean) {
    if (!nextOpen) onReset()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={handleOpenChange}
      onOpenChangeComplete={handleOpenChangeComplete}
    >
      <WorkspaceDialogContent closeDisabled={isPending}>
        <ImportWorkspaceStep
          choice={choice}
          availability={availability}
          isPending={isPending}
          errorMessage={errorMessage}
          onTypeChange={onTypeChange}
          onCancel={() => setOpen(false)}
          onSubmit={onSubmit}
        />
      </WorkspaceDialogContent>
    </Dialog>
  )
}
