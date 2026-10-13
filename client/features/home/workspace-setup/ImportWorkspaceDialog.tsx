import { useState } from 'react'

import { Button } from '@/client/components/ui/button'
import { Dialog, DialogClose } from '@/client/components/ui/dialog'
import { workspaceDisplayName } from '@/client/features/home/workspace-presentation'
import type { HarnessAvailability, WorkspaceType } from '@/lib/types'

import { WorkspaceAgentStep } from './WorkspaceAgentStep'
import { getImportWorkspaceAgentOptions } from './workspace-agent-options'
import { WorkspaceDialogContent } from './WorkspaceDialogContent'
import type { WorkspaceImportChoice } from './useWorkspaceImport'

type ImportWorkspaceDialogProps = {
  choice: WorkspaceImportChoice
  availability?: Partial<Record<WorkspaceType, HarnessAvailability>>
  isPending: boolean
  errorMessage?: string
  onTypeChange: (type: WorkspaceType) => void
  onSubmit: () => void
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
      <WorkspaceDialogContent showCloseButton={!isPending}>
        <WorkspaceAgentStep
          title={`Import ${workspaceDisplayName(choice.workspace)}`}
          selectedType={choice.selectedType}
          options={getImportWorkspaceAgentOptions({
            availability,
            detectedTypes: choice.workspace.types
          })}
          isPending={isPending}
          errorMessage={errorMessage}
          secondaryAction={
            <DialogClose render={<Button variant="secondary" />} disabled={isPending}>
              Cancel
            </DialogClose>
          }
          primaryLabel="Add workspace"
          pendingLabel="Adding…"
          onTypeChange={onTypeChange}
          onSubmit={onSubmit}
        />
      </WorkspaceDialogContent>
    </Dialog>
  )
}
