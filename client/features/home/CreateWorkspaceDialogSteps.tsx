import type { FormEvent } from 'react'

import { IconCircleCheckFilled } from '@tabler/icons-react'

import { Button } from '@/client/components/ui/button'
import { DialogDescription, DialogTitle } from '@/client/components/ui/dialog'
import { Input } from '@/client/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/client/components/ui/tooltip'
import { cn } from '@/client/lib/cn'
import {
  WorkspaceTypeIcon,
  workspaceTypeLabel
} from '@/client/features/home/workspace-presentation'
import type { HarnessAvailability, WorkspaceType } from '@/lib/types'

type WorkspaceAgentOption = {
  type: WorkspaceType
  hint: string
  disabled?: boolean
}

// Claude Code and Codex workspaces can be created from scratch; Codex needs
// its CLI on this machine (checked via `availability`). OpenClaw workspaces
// arrive through discovery.
const WORKSPACE_AGENT_OPTIONS: WorkspaceAgentOption[] = [
  { type: 'claude-code', hint: 'Great all-rounder for complex tasks built by Anthropic' },
  { type: 'codex', hint: 'OpenAI coding agent that runs through the Codex CLI' },
  {
    type: 'openclaw',
    hint: 'Initialize OpenClaw in the folder manually, then import it to moi',
    disabled: true
  }
]

type WorkspaceAgentStepProps = {
  type: WorkspaceType
  availability?: Partial<Record<WorkspaceType, HarnessAvailability>>
  canChooseFolder: boolean
  isPending: boolean
  errorMessage?: string
  onTypeChange: (type: WorkspaceType) => void
  onUseExisting: () => void
  onContinue: () => void
}

export function WorkspaceAgentStep({
  type,
  availability,
  canChooseFolder,
  isPending,
  errorMessage,
  onTypeChange,
  onUseExisting,
  onContinue
}: WorkspaceAgentStepProps) {
  // An unavailable backend stays visible but disabled, with the availability
  // reason (e.g. codex CLI install instructions) replacing the hint.
  const options = WORKSPACE_AGENT_OPTIONS.map(option => {
    const state = availability?.[option.type]
    if (!state || state.available) return option
    return { ...option, hint: state.reason, disabled: true }
  })
  const selectedUnavailable = options.find(option => option.type === type)?.disabled === true

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-0.5 pr-8">
        <DialogTitle>Choose agent</DialogTitle>
        <DialogDescription>It will be used to build your workspace</DialogDescription>
      </div>

      <div role="group" aria-label="Agent" className="grid grid-cols-2 gap-2">
        {options.map(option => (
          <WorkspaceAgentOptionButton
            key={option.type}
            option={option}
            selected={type === option.type}
            onSelect={onTypeChange}
          />
        ))}
      </div>

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

type WorkspaceAgentOptionButtonProps = {
  option: WorkspaceAgentOption
  selected: boolean
  onSelect: (type: WorkspaceType) => void
}

function WorkspaceAgentOptionButton({
  option,
  selected,
  onSelect
}: WorkspaceAgentOptionButtonProps) {
  return (
    <button
      type="button"
      disabled={option.disabled}
      onClick={() => onSelect(option.type)}
      aria-pressed={selected}
      className={cn(
        'relative flex w-full flex-col items-start justify-between gap-6 rounded-lg bg-card p-4 text-left ring-1 ring-border transition-shadow outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        !selected && !option.disabled && 'cursor-pointer',
        option.disabled && 'cursor-not-allowed opacity-50'
      )}
    >
      <span className="relative inline-flex">
        <WorkspaceTypeIcon type={option.type} className="size-10" />
        {selected && (
          <IconCircleCheckFilled
            size={20}
            stroke={1.5}
            aria-hidden="true"
            className="absolute -top-1.5 -right-1.5"
          />
        )}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-medium text-foreground">
          {workspaceTypeLabel[option.type]}
        </span>
        <span className="text-xs leading-4 text-muted-foreground">{option.hint}</span>
      </span>
    </button>
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
    <Tooltip delay={50}>
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
      <TooltipContent className="max-w-64 text-center">
        Run <code className="font-mono">moi init</code> in the folder to add it manually.
      </TooltipContent>
    </Tooltip>
  )
}
