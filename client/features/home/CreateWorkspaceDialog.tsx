import { type ReactElement, useState } from 'react'

import { IconX } from '@tabler/icons-react'
import { useLocation } from 'wouter'

import { useChooseFolder, useCreateWorkspace, useCreateWorkspaceInfo } from './api'
import { CreateWorkspaceAgentStep, WorkspaceNameStep } from './CreateWorkspaceDialogSteps'
import { useWorkspaceImport } from './useWorkspaceImport'
import { WorkspaceImportAgentStep } from './WorkspaceImportDialog'
import { Button } from '@/client/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/client/components/ui/dialog'
import { validateWorkspaceFolderName } from '@/lib/workspace-name'
import type { WorkspaceType } from '@/lib/types'

type CreateWorkspaceDialogProps = {
  trigger: ReactElement
}

type CreateWorkspaceStep = 'agent' | 'name'

const DEFAULT_WORKSPACE_TYPE: WorkspaceType = 'claude-code'

export function CreateWorkspaceDialog({ trigger }: CreateWorkspaceDialogProps) {
  const [, navigate] = useLocation()
  const info = useCreateWorkspaceInfo()
  const createMutation = useCreateWorkspace()
  const chooseFolder = useChooseFolder()
  const importFlow = useWorkspaceImport({ onSuccess: entry => finish(entry.id) })

  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<CreateWorkspaceStep>('agent')
  const [type, setType] = useState<WorkspaceType>(DEFAULT_WORKSPACE_TYPE)
  const [name, setName] = useState('')

  const trimmedName = name.trim()
  const nameError = trimmedName ? validateWorkspaceFolderName(trimmedName) : null
  const canChooseFolder = info.data?.canChooseFolder ?? true
  const isImporting = chooseFolder.isPending || importFlow.isPending
  const isCreating = createMutation.isPending

  function resetDialogState() {
    setStep('agent')
    setType(DEFAULT_WORKSPACE_TYPE)
    setName('')
    chooseFolder.reset()
    importFlow.reset()
    createMutation.reset()
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
  }

  function handleOpenChangeComplete(nextOpen: boolean) {
    if (!nextOpen) resetDialogState()
  }

  function finish(workspaceId: string) {
    setOpen(false)
    navigate(`/workspace/${workspaceId}`)
  }

  async function handleUseExisting() {
    if (isImporting) return

    chooseFolder.reset()
    importFlow.reset()

    try {
      const result = await chooseFolder.mutateAsync()
      if ('canceled' in result) return
      importFlow.startImport(result)
    } catch {
      // The active step renders the mutation error.
    }
  }

  function handleContinue() {
    createMutation.reset()
    setStep('name')
  }

  function handleCreate() {
    if (!trimmedName || nameError || isCreating) return

    createMutation.reset()
    createMutation.mutate({ name: trimmedName, type }, { onSuccess: entry => finish(entry.id) })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={handleOpenChange}
      onOpenChangeComplete={handleOpenChangeComplete}
    >
      <DialogTrigger render={trigger} />
      <DialogContent className="w-[calc(100%-2rem)] max-w-lg p-6">
        <DialogClose
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Close"
              className="absolute top-4 right-4"
            >
              <IconX stroke={1.75} />
            </Button>
          }
        />

        {importFlow.choice ? (
          <WorkspaceImportAgentStep
            types={importFlow.choice.types}
            selectedType={importFlow.choice.selectedType}
            isPending={importFlow.isPending}
            errorMessage={importFlow.error?.message}
            onTypeChange={importFlow.setSelectedType}
            onCancel={importFlow.reset}
            onSubmit={importFlow.confirmImport}
          />
        ) : step === 'agent' ? (
          <CreateWorkspaceAgentStep
            type={type}
            availability={info.data?.availability}
            canChooseFolder={canChooseFolder}
            isPending={isImporting}
            errorMessage={(chooseFolder.error ?? importFlow.error)?.message}
            onTypeChange={setType}
            onUseExisting={handleUseExisting}
            onContinue={handleContinue}
          />
        ) : (
          <WorkspaceNameStep
            name={name}
            validationError={nameError}
            requestError={createMutation.error?.message}
            isPending={isCreating}
            onNameChange={setName}
            onSubmit={handleCreate}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
