import type { ReactNode } from 'react'
import { useLocation } from 'wouter'
import { IconFolderOff } from '@tabler/icons-react'

import { workspaceProviderIcon } from '@/client/components/shared/WorkspaceIcon'
import { Button } from '@/client/components/ui/button'
import { Spinner } from '@/client/components/ui/spinner'
import { useRemoveWorkspace } from '@/client/features/home/api'
import type { HarnessAvailability, WorkspaceType } from '@/lib/types'

type RecoveryRetryProps = {
  retrying: boolean
  onRetry: () => void
}

type WorkspaceCheckFailedStateProps = RecoveryRetryProps

export function WorkspaceCheckFailedState(props: WorkspaceCheckFailedStateProps) {
  return (
    <RecoveryMessage title="Could not check your agent" {...props}>
      Could not check this workspace’s agent. Try again.
    </RecoveryMessage>
  )
}

type WorkspaceMissingStateProps = {
  workspaceId: string
}

export function WorkspaceMissingState({ workspaceId }: WorkspaceMissingStateProps) {
  const [, navigate] = useLocation()
  const remove = useRemoveWorkspace()
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <IconFolderOff size={56} stroke={0.5} className="text-muted-foreground" aria-hidden />
      <h1 className="font-medium">The workspace folder is missing</h1>
      <Button
        variant="secondary"
        disabled={remove.isPending}
        onClick={() => remove.mutate(workspaceId, { onSuccess: () => navigate('/') })}
      >
        {remove.isPending ? 'Deleting workspace…' : 'Delete workspace'}
      </Button>
      {remove.error && (
        <p role="alert" className="text-sm text-destructive">
          {remove.error.message}
        </p>
      )}
    </div>
  )
}

type HarnessUnavailableStateProps = RecoveryRetryProps & {
  type: WorkspaceType
  availability: Exclude<HarnessAvailability, { status: 'available' }>
}

export function HarnessUnavailableState({
  type,
  availability,
  ...retry
}: HarnessUnavailableStateProps) {
  const needsTerminalLogin = availability.status === 'login-required'
  return (
    <RecoveryMessage
      title={needsTerminalLogin ? 'Connect your agent' : 'Your agent is unavailable'}
      type={type}
      {...retry}
    >
      {availability.reason}
      {needsTerminalLogin && (
        <>
          <br />
          <br />
          Complete sign-in in your agent’s terminal, then try again.
        </>
      )}
    </RecoveryMessage>
  )
}

export function WorkspaceLoadingState() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <Spinner className="text-muted-foreground" />
    </div>
  )
}

type RecoveryMessageProps = RecoveryRetryProps & {
  title: string
  type?: WorkspaceType
  children: ReactNode
}

function RecoveryMessage({ title, type, children, retrying, onRetry }: RecoveryMessageProps) {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="flex w-full max-w-md flex-col gap-6">
        {type && <img src={workspaceProviderIcon[type]} alt="" className="size-10 self-center" />}
        <h1 className="text-center text-xl font-medium">{title}</h1>
        <div role="alert" className="flex flex-col items-center gap-4">
          <p className="text-sm wrap-anywhere whitespace-pre-wrap text-muted-foreground">
            {children}
          </p>
          <Button variant="secondary" disabled={retrying} onClick={onRetry}>
            Try again
          </Button>
        </div>
      </div>
    </div>
  )
}
