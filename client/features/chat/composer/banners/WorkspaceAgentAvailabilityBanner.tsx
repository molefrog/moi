import { useState } from 'react'

import { IconAlertCircle, IconLoader2, IconLogin } from '@tabler/icons-react'

import { Button } from '@/client/components/ui/button'
import type { HarnessAvailability, HarnessLogin } from '@/lib/types'

import { ComposerBannerShell } from './ComposerBanner'

type WorkspaceAgentAvailabilityBannerProps = {
  availability: Extract<HarnessAvailability, { available: false }>
  onStartLogin: () => Promise<HarnessLogin>
}

export function WorkspaceAgentAvailabilityBanner({
  availability,
  onStartLogin
}: WorkspaceAgentAvailabilityBannerProps) {
  const [state, setState] = useState<'idle' | 'starting' | 'waiting'>('idle')
  const [error, setError] = useState<string | null>(null)

  const startLogin = async () => {
    const authWindow = window.open('about:blank', 'moi-agent-login')
    if (authWindow) authWindow.opener = null
    setState('starting')
    setError(null)
    try {
      const login = await onStartLogin()
      if (login.url) {
        if (!authWindow) throw new Error('Allow pop-ups, then try again')
        authWindow.location.href = login.url
      } else {
        authWindow?.close()
      }
      setState('waiting')
    } catch (err) {
      authWindow?.close()
      setState('idle')
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
        {error && <div className="wrap-break-word text-destructive">{error}</div>}
      </div>

      {availability.loginCommand && (
        <Button
          type="button"
          size="sm"
          onClick={() => void startLogin()}
          disabled={state !== 'idle'}
          className="col-span-2 w-fit @xl:col-span-1"
        >
          {state !== 'idle' && <IconLoader2 stroke={1.75} className="animate-spin" />}
          {state === 'starting'
            ? 'Opening browser to sign in…'
            : state === 'waiting'
              ? 'Waiting for log in…'
              : 'Log in'}
        </Button>
      )}
    </ComposerBannerShell>
  )
}
