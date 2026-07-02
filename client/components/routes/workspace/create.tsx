import { type FormEvent, useState } from 'react'

import { IconLoader2, IconPlus } from '@tabler/icons-react'
import { useLocation } from 'wouter'

import { useCreateWorkspace, useCreateWorkspaceInfo } from '@/client/api/workspaces'
import { TypeIcon, typeLabel } from '@/client/components/WorkspacesPage'
import { PanelHeader, SidebarLayout, SidebarToggle } from '@/client/components/layout/SidebarLayout'
import { Button } from '@/client/components/ui/button'
import { Input } from '@/client/components/ui/input'
import { cn } from '@/client/lib/cn'
import type { WorkspaceType } from '@/lib/types'

// Mirrors the server's validateWorkspaceFolderName (workspace-init.ts) for
// instant feedback; the server remains the authority and re-validates.
function folderNameError(name: string): string | null {
  if (!name) return null // an empty field just disables the submit, no nagging
  if (name.length > 64) return 'Folder name is too long (max 64 characters)'
  if (!/^[A-Za-z0-9][A-Za-z0-9._ -]*$/.test(name)) {
    return 'Use letters, numbers, dots, dashes, underscores and spaces, starting with a letter or number'
  }
  if (name.endsWith('.') || name.endsWith(' ')) return 'Folder name cannot end with a dot or space'
  return null
}

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
  { type: 'openclaw', hint: 'Import a discovered agent from Home', disabled: true },
  { type: 'hermes', hint: 'Coming soon', disabled: true }
]

// The `/workspace/create` route: name a folder, get a provisioned (skills +
// `.moi/` scaffold) and registered workspace under the server's workspaces
// root, then land in it.
export function CreateWorkspacePage() {
  const [, navigate] = useLocation()
  const info = useCreateWorkspaceInfo()
  const createMutation = useCreateWorkspace()

  const [name, setName] = useState('')
  const [type, setType] = useState<WorkspaceType>('claude-code')

  const trimmed = name.trim()
  const nameError = folderNameError(trimmed)
  const canSubmit = trimmed.length > 0 && !nameError && !createMutation.isPending
  const root = info.data?.displayRoot ?? '…'

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    createMutation.mutate(
      { name: trimmed, type },
      { onSuccess: entry => navigate(`/workspace/${entry.id}`) }
    )
  }

  return (
    <SidebarLayout>
      <PanelHeader>
        <SidebarToggle />
        <span className="text-sm font-medium text-foreground">New workspace</span>
      </PanelHeader>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <form onSubmit={handleSubmit} className="mx-auto w-full max-w-xl px-8 pt-14 pb-16">
          <h1 className="mb-1.5 text-base font-semibold text-foreground">Create a workspace</h1>
          <p className="mb-8 text-sm text-muted-foreground">
            A new folder in <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">{root}</code>,
            set up with moi skills and widgets, ready to chat.
          </p>

          <fieldset className="mb-6">
            <legend className="mb-2 text-sm font-medium text-foreground">Agent</legend>
            <div className="grid grid-cols-3 gap-2">
              {AGENT_OPTIONS.map(option => (
                <button
                  key={option.type}
                  type="button"
                  disabled={option.disabled}
                  onClick={() => setType(option.type)}
                  aria-pressed={type === option.type}
                  className={cn(
                    'flex flex-col items-start gap-1.5 rounded-lg border p-3 text-left transition-colors',
                    type === option.type
                      ? 'border-ring bg-muted/50 shadow-[inset_0_0_0_1px_var(--ring)]'
                      : 'border-border hover:bg-muted/40',
                    option.disabled && 'cursor-not-allowed opacity-50 hover:bg-transparent'
                  )}
                >
                  <span className="flex items-center gap-2">
                    <TypeIcon type={option.type} />
                    <span className="text-sm font-medium text-foreground">
                      {typeLabel[option.type]}
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground">{option.hint}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <div className="mb-2">
            <label htmlFor="workspace-name" className="mb-2 block text-sm font-medium text-foreground">
              Folder name
            </label>
            <Input
              id="workspace-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="my-workspace"
              autoFocus
              aria-invalid={!!nameError}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          {nameError ? (
            <p className="mb-6 text-xs text-destructive">{nameError}</p>
          ) : (
            <p className="mb-6 font-mono text-xs text-muted-foreground">
              {root}/{trimmed || 'my-workspace'}
            </p>
          )}

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={!canSubmit}>
              {createMutation.isPending ? (
                <IconLoader2 stroke={1.5} className="animate-spin" />
              ) : (
                <IconPlus stroke={1.5} />
              )}
              Create workspace
            </Button>
            {createMutation.isPending && (
              <span className="text-xs text-muted-foreground">
                Setting up skills and widgets…
              </span>
            )}
          </div>
          {createMutation.isError && (
            <p className="mt-3 text-xs text-destructive">{createMutation.error.message}</p>
          )}
        </form>
      </div>
    </SidebarLayout>
  )
}
