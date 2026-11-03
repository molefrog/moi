import { useEffect, useId, type ReactNode } from 'react'
import { IconArrowRight } from '@tabler/icons-react'
import type { HarnessLogin } from '@/lib/types'
import { cn } from '@/client/lib/cn'
import { Button, buttonVariants } from '@/client/components/ui/button'
import { Textarea } from '@/client/components/ui/textarea'
import { Spinner } from '@/client/components/ui/spinner'
import { harnessLabel, harnessIcon } from './harness-presentation'
import { DeviceLoginSteps } from './device-login-steps'
import { useHarnessLogin } from './use-harness-login'
import { useRetryHarnessStatus, type LoginHarness } from './api'

type HarnessLoginPanelProps = {
  type: LoginHarness
  onConnected: () => void
  connectedContent?: ReactNode
}

export function HarnessLoginPanel({ type, onConnected, connectedContent }: HarnessLoginPanelProps) {
  const {
    auth,
    needsInstall,
    installing,
    code,
    setCode,
    manualLogin,
    setManualLogin,
    pending,
    starting,
    waitingForBrowser,
    connected,
    action,
    checkError,
    failure
  } = useHarnessLogin(type)
  const retry = useRetryHarnessStatus()
  const name = harnessLabel[type]
  useEffect(() => {
    if (connected) onConnected()
  }, [connected, onConnected])
  if (auth.isPending || (connected && !connectedContent)) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <Spinner className="size-6 text-muted-foreground" stroke={1.5} />
      </div>
    )
  }

  function renderContent() {
    if (checkError && !needsInstall && !installing) {
      return (
        <LoginCheckError
          retrying={auth.isFetching || retry.isPending}
          onRetry={() => retry.mutate()}
        />
      )
    }
    if (connected) return connectedContent
    if (pending && !installing) {
      return (
        <PendingLoginState
          name={name}
          pending={pending}
          manualLogin={manualLogin}
          waitingForBrowser={waitingForBrowser}
          onManualLogin={() => setManualLogin(true)}
          code={code}
          onCodeChange={setCode}
          submitting={action.isPending}
          onSubmit={() => action.mutate('submit')}
        />
      )
    }
    return (
      <>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          {needsInstall || installing
            ? `${name} isn’t installed on your computer yet. Install it, then log in to get started.`
            : 'Let’s log in and get your agent ready'}
        </p>
        <Button
          className="mt-6 self-center"
          disabled={installing || action.isPending || starting}
          onClick={() => action.mutate(needsInstall ? 'install' : 'start')}
        >
          {installing ? 'Installing…' : needsInstall ? `Install ${name}` : 'Log in'}
          {!needsInstall && !installing && <IconArrowRight stroke={1.75} data-icon="inline-end" />}
        </Button>
      </>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center p-6 text-center">
      <img src={harnessIcon[type]} alt="" className="mb-4 size-10" />
      <h1 className="text-center text-xl font-medium">Set up {name}</h1>
      <section
        className={cn('flex w-full flex-col items-center', !pending?.userCode && 'max-w-xs')}
        aria-label={name}
      >
        {renderContent()}
        {failure && (
          <p role="alert" className="mt-6 text-sm text-destructive">
            {failure}
          </p>
        )}
      </section>
    </div>
  )
}

type LoginCheckErrorProps = {
  retrying: boolean
  onRetry: () => void
}

function LoginCheckError({ retrying, onRetry }: LoginCheckErrorProps) {
  return (
    <div role="alert" className="mt-6 flex flex-col items-start gap-2">
      <p>Couldn’t check whether you’re logged in</p>
      <Button variant="secondary" disabled={retrying} onClick={onRetry}>
        Try again
      </Button>
    </div>
  )
}

type PendingLoginStateProps = {
  name: string
  pending: HarnessLogin
  manualLogin: boolean
  waitingForBrowser: boolean
  onManualLogin: () => void
  code: string
  onCodeChange: (code: string) => void
  submitting: boolean
  onSubmit: () => void
}

function PendingLoginState({
  name,
  pending,
  manualLogin,
  waitingForBrowser,
  onManualLogin,
  code,
  onCodeChange,
  submitting,
  onSubmit
}: PendingLoginStateProps) {
  if (pending.userCode) {
    return <DeviceLoginSteps code={pending.userCode} url={pending.url} className="mt-6" />
  }

  const showCodeForm = Boolean(pending.codeUrl && !waitingForBrowser)
  let message = 'Log in in your browser, then come back to Moi'
  if (showCodeForm) message = `Log in to ${name} to get your authorization code.`

  let url = pending.url
  if (manualLogin) url = pending.codeUrl ?? pending.url

  return (
    <>
      <p role="status" className="mt-6 text-sm text-muted-foreground">
        {message}
      </p>
      <a
        className={cn(buttonVariants({ variant: 'secondary' }), 'mt-4')}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
      >
        Open {name}
      </a>
      {waitingForBrowser && pending.codeUrl && (
        <Button variant="ghost" onClick={onManualLogin} className="mt-4">
          Having trouble logging in?
        </Button>
      )}
      {showCodeForm && (
        <LoginCodeForm
          code={code}
          onCodeChange={onCodeChange}
          submitting={submitting}
          onSubmit={onSubmit}
        />
      )}
    </>
  )
}

type LoginCodeFormProps = {
  code: string
  onCodeChange: (code: string) => void
  submitting: boolean
  onSubmit: () => void
}

function LoginCodeForm({ code, onCodeChange, submitting, onSubmit }: LoginCodeFormProps) {
  const inputId = useId()

  return (
    <form
      className="mt-6 flex w-full flex-col gap-3"
      onSubmit={event => {
        event.preventDefault()
        onSubmit()
      }}
    >
      <label htmlFor={inputId} className="text-sm text-muted-foreground">
        Paste the code here:
      </label>
      <Textarea
        id={inputId}
        aria-label="Authorization code"
        rows={3}
        className="field-sizing-fixed resize-none"
        value={code}
        onChange={event => onCodeChange(event.target.value)}
        autoComplete="off"
        spellCheck={false}
      />
      <Button type="submit" className="mt-3" disabled={!code.trim() || submitting}>
        {submitting ? 'Connecting…' : 'Continue'}
      </Button>
    </form>
  )
}
