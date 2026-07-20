import type { FormEvent } from 'react'

import { Button } from '@/client/components/ui/button'
import { DialogDescription, DialogTitle } from '@/client/components/ui/dialog'
import { Input } from '@/client/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/client/components/ui/tooltip'
import {
  WorkspaceAgentSelector,
  workspaceAgentDescription
} from '@/client/features/home/WorkspaceAgentSelector'
import type { WorkspaceAgentOption } from '@/client/features/home/WorkspaceAgentSelector'
import type { HarnessAvailability, WorkspaceType } from '@/lib/types'

// Claude Code and Codex workspaces can be created from scratch; Codex needs
// its CLI on this machine (checked via `availability`). OpenClaw workspaces
// arrive through discovery.
const WORKSPACE_AGENT_OPTIONS: WorkspaceAgentOption[] = [
  { type: 'claude-code', description: workspaceAgentDescription['claude-code'] },
  { type: 'codex', description: workspaceAgentDescription.codex },
  {
    type: 'openclaw',
    description: workspaceAgentDescription.openclaw,
    disabled: true,
    lockedDescription: 'Initialize OpenClaw in the folder\nmanually, then import it to moi'
  }
]

type CreateWorkspaceAgentStepProps = {
  type: WorkspaceType
  availability?: Partial<Record<WorkspaceType, HarnessAvailability>>
  canChooseFolder: boolean
  isPending: boolean
  errorMessage?: string
  onTypeChange: (type: WorkspaceType) => void
  onUseExisting: () => void
  onContinue: () => void
}

export function CreateWorkspaceAgentStep({
  type,
  availability,
  canChooseFolder,
  isPending,
  errorMessage,
  onTypeChange,
  onUseExisting,
  onContinue
}: CreateWorkspaceAgentStepProps) {
  // An unavailable backend stays visible but disabled, with the availability
  // reason (e.g. codex CLI install instructions) replacing the description.
  const options = WORKSPACE_AGENT_OPTIONS.map(option => {
    const state = availability?.[option.type]
    if (!state || state.available) return option
    return { ...option, description: state.reason, disabled: true }
  })
  const selectedUnavailable = options.find(option => option.type === type)?.disabled === true

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-0.5 pr-8">
        <DialogTitle>Choose agent</DialogTitle>
        <DialogDescription>It will be used to build your workspace</DialogDescription>
      </div>

      <WorkspaceAgentSelector options={options} selectedType={type} onTypeChange={onTypeChange} />

      {errorMessage && (
        <p role="alert" className="text-xs text-destructive">
          {errorMessage}
        </p>
      )}

      <div className="flex items-center justify-end gap-2">
        <ExistingFolderButton
          available={canChooseFolder}
          disabled={isPending}
          onClick={onUseExisting}
        />
        <Button onClick={onContinue} disabled={isPending || selectedUnavailable}>
          Next
        </Button>
      </div>
    </div>
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

export function WorkspaceNameStep({
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
        <DialogTitle>Name workspace</DialogTitle>
        <DialogDescription>Keep it short and recognizable</DialogDescription>
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
          {isPending ? 'Creating…' : `Create workspace`}
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
  if (available) {
    return (
      <Button variant="secondary" onClick={onClick} disabled={disabled}>
        Use existing folder
      </Button>
    )
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="secondary"
            aria-disabled
            onClick={event => event.preventDefault()}
            className="cursor-not-allowed opacity-50"
          >
            Use existing folder
          </Button>
        }
      />
      <TooltipContent>
        Run <code className="rounded-[4px] bg-accent px-1 py-0.5 font-mono">moi init</code> in the
        folder to add it manually
      </TooltipContent>
    </Tooltip>
  )
}
