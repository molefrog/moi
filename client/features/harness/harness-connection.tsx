import { useEffect, useId, useState, type ReactNode } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { cn } from '@/client/lib/cn'
import { useAppConfig } from '@/client/api/app-config'
import { Button, buttonVariants } from '@/client/components/ui/button'
import { Input } from '@/client/components/ui/input'
import { workspaceTypeLabel } from '@/client/features/workspace/workspace-presentation'
import { Skeleton } from '@/client/components/ui/skeleton'
import { startHarnessLogin, submitHarnessLoginCode, useHarnessConnection } from './api'

import { DeviceLoginSteps } from './device-login-steps'
import { IconArrowRight } from '@tabler/icons-react'

export type LoginHarness = 'claude-code' | 'codex'

type HarnessConnectionProps = {
  type: LoginHarness
  onConnected?: () => void
  connectedContent?: ReactNode
}

export function HarnessConnection({ type, onConnected, connectedContent }: HarnessConnectionProps) {
  const { environment } = useAppConfig()
  const auth = useHarnessConnection(type)
  const queryClient = useQueryClient()
  const [code, setCode] = useState('')
  const [manualLogin, setManualLogin] = useState(false)
  const inputId = useId()
  const name = workspaceTypeLabel[type]
  const login = auth.data?.login
  const pending = login?.state === 'pending' ? login : undefined
  const starting = login?.state === 'starting'
  const waitingForBrowser = environment === 'local' && !manualLogin
  const connected = !starting && !pending && auth.data?.availability.status === 'available'
  useEffect(() => {
    if (connected) onConnected?.()
  }, [connected, onConnected])
  const action = useMutation({
    mutationFn: async (kind: 'start' | 'submit') => {
      if (kind === 'start') {
        setManualLogin(false)
        setCode('')
        await startHarnessLogin(type)
      }
      if (kind === 'submit' && pending) {
        await submitHarnessLoginCode(type, pending.id, code)
        setCode('')
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['harness-auth'] })
  })
  const checkError = auth.isError || auth.data?.availability.status === 'unavailable'
  const failure = action.error?.message ?? (login?.state === 'failed' ? login.reason : undefined)

  return (
    <section
      className={cn('flex w-full flex-col gap-3 self-center', !pending?.userCode && 'max-w-xs')}
      aria-label={name}
    >
      {auth.isPending ? (
        <Skeleton className="h-10 w-full" />
      ) : checkError ? (
        <div role="alert" className="flex flex-col items-start gap-2">
          <p>Could not check agent login status.</p>
          <Button
            variant="secondary"
            disabled={auth.isFetching}
            onClick={() => void auth.refetch()}
          >
            Try again
          </Button>
        </div>
      ) : connected ? (
        (connectedContent ?? (
          <p role="status" className="text-sm text-muted-foreground">
            Connected
          </p>
        ))
      ) : (
        <>
          {pending?.userCode ? (
            <DeviceLoginSteps code={pending.userCode} url={pending.url} />
          ) : pending ? (
            <>
              <p role="status" className="text-sm text-muted-foreground">
                {pending.acceptsCode && !waitingForBrowser
                  ? 'Sign in to get the authorization code.'
                  : 'Sign in in your browser, then come back to Moi. Your workspace will open once you’re connected.'}
              </p>
              <a
                className={buttonVariants({ variant: 'secondary' })}
                href={manualLogin ? (pending.codeUrl ?? pending.url) : pending.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open browser
              </a>
              {waitingForBrowser && pending.acceptsCode && (
                <Button variant="ghost" onClick={() => setManualLogin(true)}>
                  Having trouble signing in?
                </Button>
              )}
              {!waitingForBrowser && pending.acceptsCode && (
                <form
                  className="mt-3 flex flex-col gap-3"
                  onSubmit={event => {
                    event.preventDefault()
                    action.mutate('submit')
                  }}
                >
                  <label htmlFor={inputId} className="text-sm text-muted-foreground">
                    Paste the code here:
                  </label>
                  <Input
                    id={inputId}
                    aria-label="Authorization code"
                    value={code}
                    onChange={event => setCode(event.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <Button
                    type="submit"
                    className="mt-3"
                    disabled={!code.trim() || action.isPending}
                  >
                    {action.isPending ? 'Connecting…' : 'Continue'}
                  </Button>
                </form>
              )}
            </>
          ) : (
            <Button
              className="self-center"
              disabled={action.isPending || starting}
              onClick={() => action.mutate('start')}
            >
              Continue
              <IconArrowRight stroke={1.75} data-icon="inline-end" />
            </Button>
          )}
        </>
      )}
      {failure && (
        <p role="alert" className="text-sm text-destructive">
          {failure}
        </p>
      )}
    </section>
  )
}
