import { useEffect, useRef, useState } from 'react'

import {
  IconAlertCircle,
  IconCheck,
  IconCopy,
  IconLoader2,
  IconLogin,
  IconRefresh
} from '@tabler/icons-react'

import { Button } from '@/client/components/ui/button'
import type { HarnessLoginFlow, HarnessUnavailable } from '@/lib/types'

type WorkspaceAgentAvailabilityBannerProps = {
  availability: HarnessUnavailable
  onRefresh: () => Promise<void>
  onStartLogin: () => Promise<HarnessLoginFlow>
}

export function WorkspaceAgentAvailabilityBanner({
  availability,
  onRefresh,
  onStartLogin
}: WorkspaceAgentAvailabilityBannerProps) {
  const [loginState, setLoginState] = useState<'idle' | 'starting' | 'waiting'>('idle')
  const [refreshing, setRefreshing] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const commandRef = useRef<HTMLElement>(null)
  const recovery = availability.recovery

  // The Codex app-server reports completion asynchronously. Poll the same
  // authoritative readiness endpoint while its browser flow is open; the
  // banner unmounts and Send unlocks as soon as the account appears.
  useEffect(() => {
    if (loginState !== 'waiting') return
    const interval = window.setInterval(() => void onRefresh().catch(() => {}), 2_000)
    return () => window.clearInterval(interval)
  }, [loginState, onRefresh])

  const startLogin = async () => {
    const authWindow = window.open('about:blank', 'moi-agent-login')
    if (!authWindow) {
      setError('Allow pop-ups, then try again')
      return
    }
    authWindow.opener = null
    setError(null)
    setLoginState('starting')
    try {
      const flow = await onStartLogin()
      authWindow.location.href = flow.url
      setLoginState('waiting')
    } catch (err) {
      authWindow.close()
      setLoginState('idle')
      setError(err instanceof Error ? err.message : 'Could not start sign-in')
    }
  }

  const copyCommand = async () => {
    if (!recovery) return
    try {
      let didCopy = false
      try {
        await navigator.clipboard?.writeText(recovery.command)
        didCopy = Boolean(navigator.clipboard)
      } catch {}
      if (!didCopy && commandRef.current) {
        const selection = window.getSelection()
        const range = document.createRange()
        range.selectNodeContents(commandRef.current)
        selection?.removeAllRanges()
        selection?.addRange(range)
        didCopy = document.execCommand('copy')
        selection?.removeAllRanges()
      }
      if (!didCopy) throw new Error('Copy failed')
      setCopied(true)
      setError(null)
    } catch {
      setError('Could not copy the command')
    }
  }

  const refresh = async () => {
    setRefreshing(true)
    setError(null)
    try {
      await onRefresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not check agent status')
    } finally {
      setRefreshing(false)
    }
  }

  const loginPending = loginState !== 'idle'

  return (
    <div
      role="alert"
      className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-2 p-2 text-sm @xl:flex @xl:items-center @xl:p-1 @xl:pl-3"
    >
      <div className="flex min-w-0 items-start gap-1.5 @xl:flex-1 @xl:items-center">
        <IconAlertCircle size={20} stroke={1.5} className="shrink-0 text-destructive" />
        <div className="min-w-0 space-y-1">
          <div className="wrap-break-word">{availability.reason}</div>
          {recovery && (
            <code
              ref={commandRef}
              className="block w-fit max-w-full overflow-x-auto rounded-md bg-card px-2 py-1 text-xs shadow-xs"
            >
              {recovery.command}
            </code>
          )}
          {error && <div className="wrap-break-word text-destructive">{error}</div>}
        </div>
      </div>

      <div className="col-span-2 flex flex-wrap items-center gap-1.5 @xl:contents">
        {recovery?.inApp ? (
          <Button
            type="button"
            size="sm"
            onClick={() => void startLogin()}
            disabled={loginPending}
            className="@xl:order-2"
          >
            {loginPending ? (
              <IconLoader2 stroke={1.75} className="animate-spin" />
            ) : (
              <IconLogin stroke={1.75} />
            )}
            {loginState === 'starting'
              ? 'Starting…'
              : loginState === 'waiting'
                ? 'Waiting for sign-in…'
                : 'Sign in'}
          </Button>
        ) : recovery ? (
          <Button
            type="button"
            size="sm"
            onClick={() => void copyCommand()}
            className="@xl:order-2"
          >
            {copied ? <IconCheck stroke={1.75} /> : <IconCopy stroke={1.75} />}
            {copied ? 'Copied' : 'Copy command'}
          </Button>
        ) : null}

        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => void refresh()}
          disabled={refreshing}
          className="@xl:order-3"
        >
          {refreshing ? (
            <IconLoader2 stroke={1.75} className="animate-spin" />
          ) : (
            <IconRefresh stroke={1.75} />
          )}
          {refreshing ? 'Checking…' : 'Check again'}
        </Button>
      </div>
    </div>
  )
}
