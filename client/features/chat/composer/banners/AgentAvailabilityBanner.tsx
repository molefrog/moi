import { type ReactNode } from 'react'

import {
  IconAlertCircle,
  IconLogin,
  IconPlugConnectedX,
  type TablerIcon
} from '@tabler/icons-react'

import type { AgentUnavailable } from '@/client/lib/agent-availability'

import { ComposerBannerShell } from './ComposerBanner'

type AgentAvailabilityBannerProps = {
  availability: AgentUnavailable
}

export function AgentAvailabilityBanner({ availability }: AgentAvailabilityBannerProps) {
  switch (availability.status) {
    case 'login-required':
      return (
        <AvailabilityMessage icon={IconLogin}>
          Log in to your agent to send messages
        </AvailabilityMessage>
      )
    case 'disconnected':
      return (
        <AvailabilityMessage icon={IconPlugConnectedX}>Reconnecting to moi…</AvailabilityMessage>
      )
    case 'unavailable':
      return <AvailabilityMessage icon={IconAlertCircle}>{availability.reason}</AvailabilityMessage>
  }
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
