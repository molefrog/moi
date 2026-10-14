import { type ReactNode } from 'react'

import {
  IconAlertCircle,
  IconLogin,
  IconPlugConnectedX,
  type TablerIcon
} from '@tabler/icons-react'

import { HarnessLoginDialog } from '@/client/features/setup/onboarding/harness/harness-login-dialog'
import type { AgentUnavailable } from '@/client/lib/agent-availability'
import type { HarnessLoginState, WorkspaceType } from '@/lib/types'

import { ComposerBannerShell } from './ComposerBanner'

type AgentAvailabilityBannerProps = {
  availability: AgentUnavailable
  // The server-owned ceremony. `pending` means some tab (maybe this one)
  // started a login and the server is watching for it to land; `failed` means
  // the last ceremony timed out or errored.
  login?: HarnessLoginState
  harnessType: WorkspaceType
}

export function AgentAvailabilityBanner({
  availability,
  login,
  harnessType
}: AgentAvailabilityBannerProps) {
  switch (availability.status) {
    case 'login-required':
      return <LoginRequiredBanner login={login} harnessType={harnessType} />
    case 'disconnected':
      return (
        <AvailabilityMessage icon={IconPlugConnectedX}>Reconnecting to moi…</AvailabilityMessage>
      )
    case 'unavailable':
      return <AvailabilityMessage icon={IconAlertCircle}>{availability.reason}</AvailabilityMessage>
  }
}

type LoginRequiredBannerProps = Pick<AgentAvailabilityBannerProps, 'login' | 'harnessType'>

function LoginRequiredBanner({ login, harnessType }: LoginRequiredBannerProps) {
  return (
    <ComposerBannerShell role="alert" className="flex items-center gap-2">
      <IconLogin size={20} stroke={1.5} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="wrap-break-word">Log in to your agent to send messages</div>
        {login?.state === 'failed' && (
          <div className="wrap-break-word text-destructive">{login.reason}</div>
        )}
      </div>
      {(harnessType === 'claude-code' || harnessType === 'codex') && (
        <HarnessLoginDialog type={harnessType} />
      )}
    </ComposerBannerShell>
  )
}

type AvailabilityMessageProps = {
  icon: TablerIcon
  children: ReactNode
}

function AvailabilityMessage({ icon: Icon, children }: AvailabilityMessageProps) {
  return (
    <ComposerBannerShell role="alert" className="flex items-center gap-2">
      <Icon size={20} stroke={1.5} />
      <div className="min-w-0 flex-1 wrap-break-word">{children}</div>
    </ComposerBannerShell>
  )
}
