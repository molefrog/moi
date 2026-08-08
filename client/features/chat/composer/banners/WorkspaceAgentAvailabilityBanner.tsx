import { useEffect, useState } from 'react'

import { IconLoader2, IconLogin } from '@tabler/icons-react'

import { Button } from '@/client/components/ui/button'
import type { AgentLoginState, HarnessAvailability, HarnessLogin } from '@/lib/types'

import { ComposerBannerShell } from './ComposerBanner'

type WorkspaceAgentAvailabilityBannerProps = {
  availability: Extract<HarnessAvailability, { available: false }>
  // The server-owned ceremony. `pending` means some tab (maybe this one)
  // started a login and the server is watching for it to land; `failed` means
  // the last ceremony timed out or errored.
  login?: AgentLoginState
  onStartLogin: () => Promise<HarnessLogin>
}

export function WorkspaceAgentAvailabilityBanner({
  availability,
  login,
  onStartLogin
}: WorkspaceAgentAvailabilityBannerProps) {
  // Local phase only bridges the gap between the POST resolving and the
  // server's `agent:updated` event landing; the ceremony state is the truth.
  const [phase, setPhase] = useState<'idle' | 'starting' | 'waiting'>('idle')
  const [error, setError] = useState<string | null>(null)

  // A settled ceremony (failed, or replaced by a fresh signed-out state)
  // re-enables the button.
  useEffect(() => {
    if (login?.state !== 'pending') setPhase('idle')
  }, [login?.state])

  const waiting = login?.state === 'pending' || phase === 'waiting'
  const failure = login?.state === 'failed' ? login.reason : null
  const busy = waiting || phase === 'starting'

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
    <ComposerBannerShell
      role="alert"
      className="grid grid-cols-[auto_minmax(0,1fr)] gap-2 @xl:grid-cols-[auto_minmax(0,1fr)_auto] @xl:items-center"
    >
      <IconLogin size={20} stroke={1.5} />
      <div className="min-w-0 space-y-1">
        <div className="wrap-break-word">Log in to your agent provider to send messages</div>
        {(error ?? failure) && (
          <div className="wrap-break-word text-destructive">{error ?? failure}</div>
        )}
      </div>

      {availability.loginCommand && (
        <Button
          type="button"
          size="sm"
          onClick={() => void startLogin()}
          disabled={busy}
          className="col-span-2 w-fit @xl:col-span-1"
        >
          {busy && <IconLoader2 stroke={1.75} className="animate-spin" />}
          {phase === 'starting'
            ? 'Opening browser to sign in…'
            : waiting
              ? 'Waiting for log in…'
              : 'Log in'}
        </Button>
      )}
    </ComposerBannerShell>
  )
}
