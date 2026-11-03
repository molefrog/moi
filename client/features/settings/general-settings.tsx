import { IconChevronDown, IconLoader2 } from '@tabler/icons-react'
import { useLocation } from 'wouter'

import { useAppConfig } from '@/client/api/app-config'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/client/components/ui/alert-dialog'
import { Button } from '@/client/components/ui/button'
import { Input } from '@/client/components/ui/input'
import { useRemoveWorkspace } from '@/client/features/home/api'
import { useWorkspaceLayoutCtx } from '@/client/features/workspace/workspace-layout-context'
import { harnessIcon, harnessLabel } from '@/client/features/harness/harness-presentation'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem
} from '@/client/components/ui/dropdown-menu'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/client/components/ui/tooltip'
import { useLive } from '@/client/features/chat/chat-store'
import { useWorkspaceCreationInfo } from '@/client/features/workspace/add/api'

import { useChangeWorkspaceHarness } from '@/client/features/workspace/api'
import { SettingsPage, SettingsRow, SettingsSection } from './settings-layout'

export function GeneralSettings() {
  const { demo } = useAppConfig()
  const { name, cwd, workspaceId } = useWorkspaceLayoutCtx()
  const [, navigate] = useLocation()
  const removeWorkspace = useRemoveWorkspace()
  const label = name ?? cwd ?? 'this space'

  const remove = () => {
    removeWorkspace.mutate(workspaceId, { onSuccess: () => navigate('/') })
  }

  return (
    <SettingsPage title="General" description="Basic details for this space">
      <SettingsSection>
        <SettingsRow
          title="Path"
          control={
            <Input
              value={cwd ?? ''}
              aria-label="Workspace path"
              title={cwd ?? undefined}
              className="w-56"
              readOnly
            />
          }
        />
        <WorkspaceHarnessSetting />
      </SettingsSection>

      {!demo && (
        <SettingsSection label="Danger zone">
          <SettingsRow
            title="Remove space"
            description="Remove this space from Moi. Its folder and sessions stay on disk."
            control={
              <AlertDialog>
                <AlertDialogTrigger
                  render={<Button type="button" variant="destructive" />}
                  disabled={removeWorkspace.isPending}
                >
                  Remove
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remove “{label}” from your workspaces?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This only removes it from your list. The folder and its sessions stay on disk.
                      You can add it back any time.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  {removeWorkspace.isError && (
                    <p className="text-xs text-destructive">{removeWorkspace.error.message}</p>
                  )}
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={removeWorkspace.isPending}>
                      Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                      type="button"
                      variant="destructive"
                      onClick={remove}
                      disabled={removeWorkspace.isPending}
                    >
                      {removeWorkspace.isPending && (
                        <IconLoader2
                          data-icon="inline-start"
                          stroke={1.75}
                          className="animate-spin"
                        />
                      )}
                      Remove
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            }
          />
        </SettingsSection>
      )}
    </SettingsPage>
  )
}

function WorkspaceHarnessSetting() {
  const { demo } = useAppConfig()
  const { workspaceId, provider } = useWorkspaceLayoutCtx()
  const type = provider ?? 'claude-code'
  const installations = useWorkspaceCreationInfo()
  const change = useChangeWorkspaceHarness(workspaceId)
  const active = useLive(state =>
    Object.entries(state.activity).some(
      ([key, activity]) => key.startsWith(`${workspaceId}:`) && activity !== 'idle'
    )
  )
  const reason = demo
    ? 'Changing agents is unavailable in the demo'
    : type === 'hermes' || type === 'openclaw'
      ? 'This workspace belongs to its agent and cannot use another agent'
      : active
        ? 'Wait for the agent to finish before changing it'
        : undefined
  return (
    <>
      <SettingsRow
        title="Agent"
        control={
          <Tooltip disabled={!reason}>
            <TooltipTrigger render={<span tabIndex={reason ? 0 : undefined} aria-label={reason} />}>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={<Button variant="outline" />}
                  disabled={Boolean(reason) || change.isPending || !installations.data}
                  aria-label="Agent"
                >
                  <img src={harnessIcon[type]} alt="" className="size-4 shrink-0" />
                  {harnessLabel[type]}
                  <IconChevronDown stroke={1.5} />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-44">
                  <DropdownMenuRadioGroup
                    value={type}
                    onValueChange={value => change.mutate(value)}
                  >
                    {(['claude-code', 'codex'] as const).map(option => (
                      <DropdownMenuRadioItem
                        key={option}
                        value={option}
                        disabled={!installations.data?.installed[option]}
                      >
                        <img src={harnessIcon[option]} alt="" className="size-4 shrink-0" />
                        {harnessLabel[option]}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </TooltipTrigger>
            <TooltipContent>{reason}</TooltipContent>
          </Tooltip>
        }
      />
      {change.error && (
        <p role="alert" className="text-sm text-destructive">
          {change.error.message}
        </p>
      )}
    </>
  )
}
