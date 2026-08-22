import { type ReactNode, useState } from 'react'

import {
  IconAlertCircle,
  IconLoader2,
  IconLogin,
  IconPlugConnectedX,
  type TablerIcon
} from '@tabler/icons-react'

import { Button } from '@/client/components/ui/button'
import type { AgentUnavailable } from '@/client/lib/agent-availability'
import type { AgentLoginState, HarnessLogin } from '@/lib/types'

import { ComposerBannerShell } from './ComposerBanner'

type AgentAvailabilityBannerProps = {
  availability: AgentUnavailable
  // The server-owned ceremony. `pending` means some tab (maybe this one)
  // started a login and the server is watching for it to land; `failed` means
  // the last ceremony timed out or errored.
  login?: AgentLoginState
  onStartLogin: () => Promise<HarnessLogin>
}

export function AgentAvailabilityBanner({
  availability,
  login,
  onStartLogin
}: AgentAvailabilityBannerProps) {
  switch (availability.status) {
    case 'login-required':
      return <LoginRequiredBanner login={login} onStartLogin={onStartLogin} />
    case 'disconnected':
      return (
        <AvailabilityMessage icon={IconPlugConnectedX}>Reconnecting to moi…</AvailabilityMessage>
      )
    case 'unavailable':
      return <AvailabilityMessage icon={IconAlertCircle}>{availability.reason}</AvailabilityMessage>
  }
}

type LoginRequiredBannerProps = Pick<AgentAvailabilityBannerProps, 'login' | 'onStartLogin'>

function LoginRequiredBanner({ login, onStartLogin }: LoginRequiredBannerProps) {
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const failure = login?.state === 'failed' ? login.reason : null
  const loginError = error ?? failure

  const startLogin = async () => {
    const authWindow = window.open('about:blank', 'moi-agent-login')
    if (authWindow) authWindow.opener = null
    setStarting(true)
    setError(null)
    try {
      const result = await onStartLogin()
      if (result.url) {
        if (!authWindow) throw new Error('Allow pop-ups, then try again')
        authWindow.location.href = result.url
      } else {
        authWindow?.close()
      }
    } catch (err) {
      authWindow?.close()
      setError(err instanceof Error ? err.message : 'Could not start sign-in')
    } finally {
      setStarting(false)
    }
  }

  return (
    <ComposerBannerShell role="alert" className="flex items-center gap-2">
      <IconLogin size={20} stroke={1.5} />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="wrap-break-word">Log in to your agent to send messages</div>
        {loginError && <div className="wrap-break-word text-destructive">{loginError}</div>}
      </div>

      <Button type="button" size="sm" onClick={() => void startLogin()} disabled={starting}>
        {starting && <IconLoader2 stroke={1.75} className="animate-spin" />}
        Log in
      </Button>
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
