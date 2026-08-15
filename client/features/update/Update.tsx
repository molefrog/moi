import { useEffect, type ReactNode } from 'react'

import { IconDownload } from '@tabler/icons-react'

import { Button } from '@/client/components/ui/button'
import { Spinner } from '@/client/components/ui/spinner'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/client/components/ui/tooltip'
import { hasRunningActivity, useLive } from '@/client/features/chat/chat-store'
import { UPDATE_ACTIVE_AGENT_MESSAGE } from '@/lib/update'
import type { UpdateStatus } from '@/lib/types'

import { useUpdate, useUpdateStatus } from './api'

type UpdateProps = {
  fallback?: ReactNode
}

export function shouldReloadAfterUpdate(
  status: UpdateStatus | undefined,
  targetVersion: string | null
): boolean {
  return !!targetVersion && status?.runningVersion === targetVersion
}

export function getUpdateButtonState(
  agentRunning: boolean,
  updating: boolean,
  restarting: boolean
) {
  const busy = updating || restarting
  const blocked = agentRunning && !busy
  const label = updating
    ? 'Updating'
    : restarting
      ? 'Restarting'
      : blocked
        ? UPDATE_ACTIVE_AGENT_MESSAGE
        : 'Update'
  return { busy, blocked, label }
}

export function Update({ fallback = null }: UpdateProps) {
  const update = useUpdate()
  const statusQuery = useUpdateStatus(update.isSuccess)
  const agentRunning = useLive(state => hasRunningActivity(state.activity))
  const status = statusQuery.data
  const restartTarget = update.data?.installedVersion ?? null

  useEffect(() => {
    if (shouldReloadAfterUpdate(status, restartTarget)) window.location.reload()
  }, [restartTarget, status])

  if (!status?.availableVersion) return fallback

  const restarting = update.isSuccess
  const button = getUpdateButtonState(agentRunning, update.isPending, restarting)

  // The div gives TooltipTrigger an enabled event target when the button is disabled.
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <div>
            <Button
              type="button"
              size="icon"
              variant={button.busy ? 'ghost' : 'default'}
              aria-label={button.label}
              disabled={button.blocked || button.busy}
              onClick={() => update.mutate()}
            >
              {button.busy ? <Spinner stroke={1.5} /> : <IconDownload stroke={1.5} />}
            </Button>
          </div>
        }
      />
      <TooltipContent side="right" className={button.blocked ? 'max-w-56' : undefined}>
        {button.blocked ? UPDATE_ACTIVE_AGENT_MESSAGE : (update.error?.message ?? button.label)}
      </TooltipContent>
    </Tooltip>
  )
}
