import { type FormEvent, type ReactElement, useState } from 'react'

import { useLocation } from 'wouter'

import { useChooseFolder, useCreateWorkspace, useWorkspaceSetupInfo } from '../api'
import { Button } from '@/client/components/ui/button'
import {
  Dialog,
  DialogDescription,
  DialogTitle,
  DialogTrigger
} from '@/client/components/ui/dialog'
import { Input } from '@/client/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/client/components/ui/tooltip'
import { cn } from '@/client/lib/cn'
import { validateWorkspaceFolderName } from '@/lib/workspace-name'
import { WORKSPACE_TYPE_ORDER } from '@/lib/workspace-types'
import type { WorkspaceType } from '@/lib/types'

import { ImportWorkspaceStep } from './ImportWorkspaceDialog'
import { WorkspaceAgentStep } from './WorkspaceAgentStep'
import { WorkspaceDialogContent } from './WorkspaceDialogContent'
import { useWorkspaceImport } from './useWorkspaceImport'

type CreateWorkspaceDialogProps = {
  trigger: ReactElement
}

type CreateWorkspaceStep = 'agent' | 'name'

const DEFAULT_WORKSPACE_TYPE = WORKSPACE_TYPE_ORDER[0]

export function CreateWorkspaceDialog({ trigger }: CreateWorkspaceDialogProps) {
  const [, navigate] = useLocation()
  const info = useWorkspaceSetupInfo()
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

  function finish(workspaceId: string) {
    setOpen(false)
    navigate(`/workspace/${workspaceId}`)
  }

  function resetDialog() {
    setStep('agent')
    setType(DEFAULT_WORKSPACE_TYPE)
    setName('')
    chooseFolder.reset()
    importFlow.reset()
    createMutation.reset()
  }

  async function chooseExistingFolder() {
    if (isImporting) return
    chooseFolder.reset()

    try {
      const result = await chooseFolder.mutateAsync()
      if (!('canceled' in result)) importFlow.startImport(result)
    } catch {
      // The agent step renders the folder-picker error.
    }
  }

  function continueToName() {
    createMutation.reset()
    setStep('name')
  }

  function createWorkspace() {
    if (!trimmedName || nameError || isCreating) return
    createMutation.reset()
    createMutation.mutate({ name: trimmedName, type }, { onSuccess: entry => finish(entry.id) })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      onOpenChangeComplete={nextOpen => {
        if (!nextOpen) resetDialog()
      }}
    >
      <DialogTrigger render={trigger} />
      <WorkspaceDialogContent>
        {importFlow.choice ? (
          <ImportWorkspaceStep
            choice={importFlow.choice}
            availability={info.data?.availability}
            isPending={importFlow.isPending}
            errorMessage={importFlow.error?.message}
            onTypeChange={importFlow.selectType}
            onCancel={importFlow.reset}
            onSubmit={importFlow.submit}
          />
        ) : step === 'agent' ? (
          <WorkspaceAgentStep
            title="Create new workspace"
            selectedType={type}
            availability={info.data?.availability}
            isPending={isImporting}
            errorMessage={(chooseFolder.error ?? importFlow.error)?.message}
            secondaryAction={
              <ExistingFolderButton
                available={canChooseFolder}
                disabled={isImporting}
                onClick={chooseExistingFolder}
              />
            }
            primaryLabel="Next"
            onTypeChange={setType}
            onSubmit={continueToName}
          />
        ) : (
          <WorkspaceNameStep
            name={name}
            validationError={nameError}
            requestError={createMutation.error?.message}
            isPending={isCreating}
            onNameChange={setName}
            onSubmit={createWorkspace}
          />
        )}
      </WorkspaceDialogContent>
    </Dialog>
  )
}

type WorkspaceNameStepProps = {
  name: string
  validationError: string | null
  requestError?: string
  isPending: boolean
  onNameChange: (name: string) => void
  onSubmit: () => void
}

function WorkspaceNameStep({
  name,
  validationError,
  requestError,
  isPending,
  onNameChange,
  onSubmit
}: WorkspaceNameStepProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSubmit()
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-0.5 pr-8">
        <DialogTitle>Create new workspace</DialogTitle>
        <DialogDescription>Give it a short and recognizable name</DialogDescription>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="workspace-name" className="sr-only">
          Workspace name
        </label>
        <Input
          id="workspace-name"
          value={name}
          onChange={event => onNameChange(event.target.value)}
          placeholder="my-workspace"
          autoFocus
          aria-invalid={Boolean(validationError)}
          aria-describedby={validationError ? 'workspace-name-error' : undefined}
          autoComplete="off"
          spellCheck={false}
        />
        {validationError && (
          <p id="workspace-name-error" role="alert" className="text-xs text-destructive">
            {validationError}
          </p>
        )}
      </div>

      {requestError && (
        <p role="alert" className="text-xs text-destructive">
          {requestError}
        </p>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button type="submit" disabled={!name.trim() || Boolean(validationError) || isPending}>
          {isPending ? 'Creating…' : 'Create workspace'}
        </Button>
      </div>
    </form>
  )
}

type ExistingFolderButtonProps = {
  available: boolean
  disabled: boolean
  onClick: () => void
}

function ExistingFolderButton({ available, disabled, onClick }: ExistingFolderButtonProps) {
  const button = (
    <Button
      variant="secondary"
      disabled={available && disabled}
      aria-disabled={!available || undefined}
      onClick={event => {
        if (!available) {
          event.preventDefault()
          return
        }
        onClick()
      }}
      className={cn(!available && 'cursor-not-allowed opacity-50')}
    >
      Use existing folder
    </Button>
  )

  if (available) return button

  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipContent>
        Run <code className="rounded-[4px] bg-accent px-1 py-0.5 font-mono">moi init</code> in the
        folder to add it manually
      </TooltipContent>
    </Tooltip>
  )
}
