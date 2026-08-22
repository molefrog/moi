import { type ReactNode, useEffect, useState } from 'react'

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

type LoginPhase = 'idle' | 'starting' | 'waiting'

const LOGIN_PHASE_LABELS: Record<LoginPhase, string> = {
  idle: 'Log in',
  starting: 'Opening browser to sign in…',
  waiting: 'Waiting for log in…'
}

function LoginRequiredBanner({ login, onStartLogin }: LoginRequiredBannerProps) {
  // Local phase only bridges the gap between the POST resolving and the
  // server's `agent:updated` event landing; the ceremony state is the truth.
  const [phase, setPhase] = useState<LoginPhase>('idle')
  const [error, setError] = useState<string | null>(null)

  // A settled ceremony (failed, or replaced by a fresh signed-out state)
  // re-enables the button.
  useEffect(() => {
    if (login?.state !== 'pending') setPhase('idle')
  }, [login?.state])

  const effectivePhase = login?.state === 'pending' ? 'waiting' : phase
  const failure = login?.state === 'failed' ? login.reason : null
  const busy = effectivePhase !== 'idle'
  const loginError = error ?? failure

  const startLogin = async () => {
    const authWindow = window.open('about:blank', 'moi-agent-login')
    if (authWindow) authWindow.opener = null
    setPhase('starting')
    setError(null)
    try {
      const result = await onStartLogin()
      if (result.url) {
        if (!authWindow) throw new Error('Allow pop-ups, then try again')
        authWindow.location.href = result.url
      } else {
        authWindow?.close()
      }
      setPhase('waiting')
    } catch (err) {
      authWindow?.close()
      setPhase('idle')
      setError(err instanceof Error ? err.message : 'Could not start sign-in')
    }
  }

  return (
    <ComposerBannerShell role="alert" className="flex items-center gap-2">
      <IconLogin size={20} stroke={1.5} />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="wrap-break-word">Log in to your agent to send messages</div>
        {loginError && <div className="wrap-break-word text-destructive">{loginError}</div>}
      </div>

      <Button type="button" size="sm" onClick={() => void startLogin()} disabled={busy}>
        {busy && <IconLoader2 stroke={1.75} className="animate-spin" />}
        {LOGIN_PHASE_LABELS[effectivePhase]}
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
