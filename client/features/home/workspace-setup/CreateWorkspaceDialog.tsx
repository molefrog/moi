import { type FormEvent, type ReactElement, useState } from 'react'

import { useLocation } from 'wouter'

import { useCreateWorkspace, useWorkspaceSetupInfo } from '../api'
import { useAppConfig } from '@/client/api/app-config'
import { Button } from '@/client/components/ui/button'
import {
  Dialog,
  DialogDescription,
  DialogTitle,
  DialogTrigger
} from '@/client/components/ui/dialog'
import { Input } from '@/client/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/client/components/ui/tooltip'
import { validateWorkspaceFolderName } from '@/lib/workspace-name'
import { WORKSPACE_TYPE_ORDER } from '@/lib/workspace-types'
import type { WorkspaceType } from '@/lib/types'

import { InstallMoiDialog } from './InstallMoiDialog'
import { WorkspaceAgentStep } from './WorkspaceAgentStep'
import { WorkspaceDialogContent } from './WorkspaceDialogContent'

type CreateWorkspaceDialogProps = {
  trigger: ReactElement
}

type CreateWorkspaceStep = 'agent' | 'name'

const DEFAULT_WORKSPACE_TYPE = WORKSPACE_TYPE_ORDER[0]

export function CreateWorkspaceDialog({ trigger }: CreateWorkspaceDialogProps) {
  const [, navigate] = useLocation()
  const appConfig = useAppConfig()
  const info = useWorkspaceSetupInfo()
  const createMutation = useCreateWorkspace()

  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<CreateWorkspaceStep>('agent')
  const [type, setType] = useState<WorkspaceType>(DEFAULT_WORKSPACE_TYPE)
  const [name, setName] = useState('')

  const trimmedName = name.trim()
  const nameError = trimmedName ? validateWorkspaceFolderName(trimmedName) : null
  const isCreating = createMutation.isPending

  // Cloud demo: creating workspaces is off — the same trigger opens the
  // install-moi dialog instead. After every hook so the hook order is stable.
  if (appConfig.cloudDemo) {
    return <InstallMoiDialog trigger={trigger} />
  }

  function finish(workspaceId: string) {
    setOpen(false)
    navigate(`/workspace/${workspaceId}`)
  }

  function resetDialog() {
    setStep('agent')
    setType(DEFAULT_WORKSPACE_TYPE)
    setName('')
    createMutation.reset()
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
        {step === 'agent' ? (
          <WorkspaceAgentStep
            title="Create new workspace"
            selectedType={type}
            availability={info.data?.availability}
            isPending={false}
            secondaryAction={<ExistingFolderButton />}
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

// Importing a folder from the app is on hold: the native picker only ever ran on
// macOS and cannot work at all when moi is opened from another device. The
// button stays as the signpost for the console route.
function ExistingFolderButton() {
  const button = (
    <Button
      variant="secondary"
      aria-disabled
      onClick={event => event.preventDefault()}
      className="cursor-not-allowed opacity-50"
    >
      Use existing folder
    </Button>
  )

  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipContent className="max-w-64">
        {/* The popup lays its children out in a row — one span keeps the copy
            flowing as a sentence with the command inline. */}
        <span className="text-center">
          Not supported yet — run{' '}
          <code className="rounded-xs bg-accent px-1 py-0.5 font-mono whitespace-nowrap">
            moi init
          </code>{' '}
          in the folder from your console to add it
        </span>
      </TooltipContent>
    </Tooltip>
  )
}
