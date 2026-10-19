import { useState } from 'react'

import { Button } from '@/client/components/ui/button'
import { Dialog, DialogClose } from '@/client/components/ui/dialog'
import { workspaceDisplayName } from '@/client/features/workspace/workspace-presentation'
import type { WorkspaceType } from '@/lib/types'

import { WorkspaceAgentSelector } from './workspace-agent-selector'
import { useWorkspaceCreationInfo } from './api'
import { getWorkspaceAgentOptions } from './workspace-agent-options'
import { WorkspaceDialogContent } from './workspace-dialog-content'
import type { WorkspaceImportChoice } from './use-workspace-import'

type ImportWorkspaceDialogProps = {
  choice: WorkspaceImportChoice
  isPending: boolean
  errorMessage?: string
  onTypeChange: (type: WorkspaceType) => void
  onSubmit: () => void
  onReset: () => void
}

export function ImportWorkspaceDialog({
  choice,
  isPending,
  errorMessage,
  onTypeChange,
  onSubmit,
  onReset
}: ImportWorkspaceDialogProps) {
  const [open, setOpen] = useState(true)
  const info = useWorkspaceCreationInfo()
  const isChecking = info.isPending || info.isFetching
  const installed = info.isError ? undefined : info.data?.installed
  const options = getWorkspaceAgentOptions(installed, choice.workspace.types)
  const detectionError = !isChecking && !installed ? 'Could not check installed agents.' : undefined
  const canImport =
    !isPending &&
    !isChecking &&
    !detectionError &&
    options.some(option => option.type === choice.selectedType && !option.disabled)

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
        <WorkspaceAgentSelector
          title={`Import ${workspaceDisplayName(choice.workspace)}`}
          selectedType={choice.selectedType}
          options={options}
          isLoading={isChecking && !installed}
          isPending={isPending || isChecking || Boolean(detectionError)}
          errorMessage={detectionError ?? errorMessage}
          secondaryAction={
            <DialogClose render={<Button variant="secondary" />} disabled={isPending}>
              Cancel
            </DialogClose>
          }
          primaryLabel="Add workspace"
          pendingLabel={isPending ? 'Adding…' : undefined}
          onTypeChange={onTypeChange}
          onSubmit={() => {
            if (canImport) onSubmit()
          }}
        />
      </WorkspaceDialogContent>
    </Dialog>
  )
}
