import { type FormEvent, type ReactElement, useState } from 'react'

import { useLocation } from 'wouter'

import { useCreateWorkspace, useWorkspaceCreationInfo } from '@/client/features/workspace/add/api'
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

import { DemoDialog } from '@/client/features/demo/demo-dialog'
import { welcomeNewWorkspace } from '../setup/workspace-welcome-state'
import { WorkspaceAgentSelector } from './workspace-agent-selector'
import { getWorkspaceAgentOptions } from './workspace-agent-options'
import { WorkspaceDialogContent } from './workspace-dialog-content'

type CreateWorkspaceDialogProps = {
  trigger: ReactElement
}

type CreateWorkspaceStep = 'agent' | 'name'

const DEFAULT_WORKSPACE_TYPE = WORKSPACE_TYPE_ORDER[0]

export function CreateWorkspaceDialog({ trigger }: CreateWorkspaceDialogProps) {
  const [, navigate] = useLocation()
  const appConfig = useAppConfig()
  const info = useWorkspaceCreationInfo()
  const createMutation = useCreateWorkspace()

  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<CreateWorkspaceStep>('name')
  const [type, setType] = useState<WorkspaceType>(DEFAULT_WORKSPACE_TYPE)
  const [name, setName] = useState('')

  const trimmedName = name.trim()
  const nameError = trimmedName ? validateWorkspaceFolderName(trimmedName) : null
  const isCreating = createMutation.isPending
  const isChecking = info.isPending || info.isFetching
  const installed = info.isError ? undefined : info.data?.installed
  const options = getWorkspaceAgentOptions(installed)
  const selectedAvailable = options.some(option => option.type === type && !option.disabled)
  const detectionError = !isChecking && !installed ? 'Could not check installed agents.' : undefined
  const canUseAgent = !isChecking && !detectionError && selectedAvailable

  // Cloud demo: creating workspaces is off — the same trigger opens the
  // cloud-demo promo dialog instead. After every hook so the hook order is stable.
  if (appConfig.demo) {
    return <DemoDialog trigger={trigger} />
  }

  function finish(workspaceId: string) {
    welcomeNewWorkspace(workspaceId)
    setOpen(false)
    navigate(`/workspace/${workspaceId}`)
  }

  function resetDialog() {
    setStep('name')
    setType(DEFAULT_WORKSPACE_TYPE)
    setName('')
    createMutation.reset()
  }

  function continueToAgent() {
    if (!trimmedName || nameError) return
    createMutation.reset()
    setStep('agent')
  }

  function createWorkspace() {
    if (!trimmedName || nameError || isCreating || !canUseAgent) return
    createMutation.reset()
    createMutation.mutate({ name: trimmedName, type }, { onSuccess: entry => finish(entry.id) })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={nextOpen => {
        if (!nextOpen && isCreating) return
        setOpen(nextOpen)
        if (nextOpen) void info.refetch({ cancelRefetch: false })
      }}
      onOpenChangeComplete={nextOpen => {
        if (!nextOpen) resetDialog()
      }}
    >
      <DialogTrigger render={trigger} />
      <WorkspaceDialogContent showCloseButton={!isCreating}>
        {step === 'name' ? (
          <WorkspaceNameStep
            name={name}
            validationError={nameError}
            onNameChange={setName}
            onSubmit={continueToAgent}
          />
        ) : (
          <WorkspaceAgentSelector
            title="Create new workspace"
            selectedType={type}
            options={options}
            isLoading={isChecking && !installed}
            errorMessage={detectionError ?? createMutation.error?.message}
            emptyMessage="Install at least one agent to create a new workspace"
            isPending={isCreating || isChecking || Boolean(detectionError)}
            secondaryAction={
              <Button variant="secondary" disabled={isCreating} onClick={() => setStep('name')}>
                Back
              </Button>
            }
            primaryLabel="Create workspace"
            pendingLabel={isCreating ? 'Creating…' : undefined}
            onTypeChange={setType}
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
  onNameChange: (name: string) => void
  onSubmit: () => void
}

function WorkspaceNameStep({
  name,
  validationError,
  onNameChange,
  onSubmit
}: WorkspaceNameStepProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSubmit()
  }

  return (
    <form
      className="flex min-w-[min(22rem,calc(100vw-5rem))] flex-col gap-5"
      onSubmit={handleSubmit}
    >
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
          placeholder="Workspace name"
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

      <div className="flex items-center justify-end gap-2">
        <ExistingFolderButton />
        <Button type="submit" disabled={!name.trim() || Boolean(validationError)}>
          Next
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
      className="cursor-not-allowed bg-accent text-muted-foreground hover:bg-accent"
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
