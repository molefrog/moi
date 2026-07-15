import { type ReactElement, useState } from 'react'

import { IconCheck, IconX } from '@tabler/icons-react'
import { useLocation } from 'wouter'

import { useAddWorkspace, useChooseFolder, useCreateWorkspace, useCreateWorkspaceInfo } from './api'
import { Button } from '@/client/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger
} from '@/client/components/ui/dialog'
import { Input } from '@/client/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/client/components/ui/tooltip'
import { cn } from '@/client/lib/cn'
import {
  WorkspaceTypeIcon,
  workspaceTypeLabel
} from '@/client/features/home/workspace-presentation'
import { validateWorkspaceFolderName } from '@/lib/workspace-name'
import type { WorkspaceType } from '@/lib/types'

type AgentOption = {
  type: WorkspaceType
  hint: string
  disabled?: boolean
}

// Only Claude Code workspaces can be created from scratch for now. OpenClaw
// workspaces belong to their agents — they arrive via discovery on the home
// page — and Hermes has no init path yet.
const AGENT_OPTIONS: AgentOption[] = [
  { type: 'claude-code', hint: 'Powered by the Claude Agent SDK' },
  {
    type: 'openclaw',
    hint: 'Initialize OpenClaw in the folder manually, then import it from home',
    disabled: true
  },
  { type: 'hermes', hint: 'Coming soon', disabled: true }
]

type CreateWorkspaceDialogProps = {
  trigger: ReactElement
}

type Step = 'type' | 'name'

// A two-step dialog for adding a workspace. Step one picks the agent type and
// offers "Use existing folder" (opens the OS folder picker via the server) or
// "Next"; step two names a brand-new folder created under the workspaces root.
export function CreateWorkspaceDialog({ trigger }: CreateWorkspaceDialogProps) {
  const [, navigate] = useLocation()
  const info = useCreateWorkspaceInfo()
  const createMutation = useCreateWorkspace()
  const addMutation = useAddWorkspace()
  const chooseFolder = useChooseFolder()

  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>('type')
  const [type, setType] = useState<WorkspaceType>('claude-code')
  const [name, setName] = useState('')

  const trimmed = name.trim()
  const nameError = trimmed ? validateWorkspaceFolderName(trimmed) : null
  // The native folder picker is macOS-only (osascript). Elsewhere the button is
  // disabled with a tooltip pointing to the manual `moi init` path. Default to
  // enabled while the flag loads so mac users don't see a flicker.
  const canChooseFolder = info.data?.canChooseFolder ?? true
  const busy = createMutation.isPending || addMutation.isPending || chooseFolder.isPending
  const error = createMutation.error ?? addMutation.error ?? chooseFolder.error

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      // Reset so the dialog always reopens at step one with a clean slate.
      setStep('type')
      setName('')
    }
  }

  function finish(id: string) {
    setOpen(false)
    navigate(`/workspace/${id}`)
  }

  async function handleUseExisting() {
    if (busy) return
    try {
      const result = await chooseFolder.mutateAsync()
      if ('canceled' in result) return
      const entry = await addMutation.mutateAsync({ path: result.path, type })
      finish(entry.id)
    } catch {
      // Surfaced via the mutation error state below.
    }
  }

  function handleCreate() {
    if (!trimmed || nameError || busy) return
    createMutation.mutate({ name: trimmed, type }, { onSuccess: entry => finish(entry.id) })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={trigger} />
      <DialogContent className="w-[520px] max-w-[92vw] p-6">
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

        {step === 'type' ? (
          <>
            <DialogTitle>Create new workspace</DialogTitle>
            <p className="mt-4 mb-2 text-sm font-medium text-foreground">Agent</p>
            <div className="flex flex-col gap-2">
              {AGENT_OPTIONS.map(option => {
                const selected = type === option.type
                return (
                  <button
                    key={option.type}
                    type="button"
                    disabled={option.disabled}
                    onClick={() => setType(option.type)}
                    aria-pressed={selected}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-4 py-3 text-left ring-1 ring-border',
                      selected ? 'bg-card' : 'hover:bg-accent',
                      option.disabled && 'cursor-not-allowed opacity-50 hover:bg-transparent'
                    )}
                  >
                    <WorkspaceTypeIcon type={option.type} className="size-5" />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-sm font-medium text-foreground">
                        {workspaceTypeLabel[option.type]}
                      </span>
                      <span className="text-xs text-muted-foreground">{option.hint}</span>
                    </span>
                    {selected && (
                      <IconCheck
                        className="flex size-5 shrink-0 items-center justify-center"
                        aria-hidden="true"
                        stroke={1.75}
                      />
                    )}
                  </button>
                )
              })}
            </div>

            {error && <p className="mt-4 text-xs text-destructive">{error.message}</p>}

            <div className="mt-6 flex items-center justify-end gap-2">
              {canChooseFolder ? (
                <Button variant="secondary" onClick={handleUseExisting} disabled={busy}>
                  Use existing folder
                </Button>
              ) : (
                <Tooltip delay={50}>
                  <TooltipTrigger
                    render={
                      // aria-disabled (not the native `disabled` attr) keeps the
                      // button hoverable so the tooltip still shows.
                      <Button
                        variant="secondary"
                        aria-disabled
                        onClick={e => e.preventDefault()}
                        className="cursor-not-allowed opacity-50"
                      >
                        Use existing folder
                      </Button>
                    }
                  />
                  <TooltipContent className="max-w-64 text-center">
                    Run <code className="font-mono">moi init</code> in the folder to add it
                    manually.
                  </TooltipContent>
                </Tooltip>
              )}
              <Button onClick={() => setStep('name')} disabled={busy}>
                Next
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogTitle>Name the workspace</DialogTitle>
            <DialogDescription className="mt-1">Keep it short and recognizable</DialogDescription>

            <div className="mt-5">
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleCreate()
                }}
                placeholder="my-workspace"
                autoFocus
                aria-invalid={!!nameError}
                autoComplete="off"
                spellCheck={false}
              />
              {nameError && <p className="mt-2 text-xs text-destructive">{nameError}</p>}
            </div>

            {error && <p className="mt-4 text-xs text-destructive">{error.message}</p>}

            <div className="mt-6 flex items-center justify-end gap-2">
              <Button onClick={handleCreate} disabled={!trimmed || !!nameError || busy}>
                {createMutation.isPending ? 'Creating…' : 'Create new workspace'}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
