import { type ReactElement, useState } from 'react'

import { IconX } from '@tabler/icons-react'
import { useLocation } from 'wouter'

import { useAddWorkspace, useChooseFolder, useCreateWorkspace, useCreateWorkspaceInfo } from './api'
import { WorkspaceAgentStep, WorkspaceNameStep } from './CreateWorkspaceDialogSteps'
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
  const addMutation = useAddWorkspace()
  const chooseFolder = useChooseFolder()

  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<CreateWorkspaceStep>('agent')
  const [type, setType] = useState<WorkspaceType>(DEFAULT_WORKSPACE_TYPE)
  const [name, setName] = useState('')

  const trimmedName = name.trim()
  const nameError = trimmedName ? validateWorkspaceFolderName(trimmedName) : null
  const canChooseFolder = info.data?.canChooseFolder ?? true
  const isImporting = chooseFolder.isPending || addMutation.isPending
  const isCreating = createMutation.isPending

  function resetDialog() {
    setOpen(false)
    setStep('agent')
    setType(DEFAULT_WORKSPACE_TYPE)
    setName('')
    chooseFolder.reset()
    addMutation.reset()
    createMutation.reset()
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setOpen(true)
      return
    }
    resetDialog()
  }

  function finish(workspaceId: string) {
    resetDialog()
    navigate(`/workspace/${workspaceId}`)
  }

  async function handleUseExisting() {
    if (isImporting) return

    chooseFolder.reset()
    addMutation.reset()

    try {
      const result = await chooseFolder.mutateAsync()
      if ('canceled' in result) return
      const entry = await addMutation.mutateAsync({ path: result.path, type })
      finish(entry.id)
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
    <Dialog open={open} onOpenChange={handleOpenChange}>
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

        {step === 'agent' ? (
          <WorkspaceAgentStep
            type={type}
            availability={info.data?.availability}
            canChooseFolder={canChooseFolder}
            isPending={isImporting}
            errorMessage={(chooseFolder.error ?? addMutation.error)?.message}
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
