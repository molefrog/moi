import { useEffect, useId, useState, type ReactNode } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { useAppConfig } from '@/client/api/app-config'
import { Button, buttonVariants } from '@/client/components/ui/button'
import { Input } from '@/client/components/ui/input'
import { toast } from '@/client/components/ui/toast'
import { workspaceTypeLabel } from '@/client/features/workspace/workspace-presentation'
import { Skeleton } from '@/client/components/ui/skeleton'
import { startHarnessLogin, submitHarnessLoginCode, useHarnessConnection } from './api'

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
  const waitingForBrowser = environment === 'local' && !manualLogin
  const connected = !pending && auth.data?.availability.status === 'available'
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
      if (kind === 'submit' && pending?.id) {
        await submitHarnessLoginCode(type, pending.id, code)
        setCode('')
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['harness-auth'] })
  })
  const checkError = auth.isError || auth.data?.availability.status === 'unavailable'
  const failure = action.error?.message ?? (login?.state === 'failed' ? login.reason : undefined)

  return (
    <section className="flex flex-col gap-3" aria-label={name}>
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
          {type === 'codex' && environment === 'cloud' && (
            <p className="text-sm text-muted-foreground">
              Enable device code login in your ChatGPT security settings first. For a managed
              ChatGPT workspace, ask your admin to enable it.
            </p>
          )}
          {pending ? (
            <>
              <p role="status" className="text-sm text-muted-foreground">
                {pending.userCode
                  ? 'Copy this code, open the sign-in page, and enter it there.'
                  : pending.acceptsCode && !waitingForBrowser
                    ? 'Sign in to get the authorization code.'
                    : 'Sign in in your browser, then come back to moi. Your workspace will open once you’re connected.'}
              </p>
              {pending.userCode && (
                <div className="flex items-center gap-3">
                  <code className="text-sm">{pending.userCode}</code>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      navigator.clipboard.writeText(pending.userCode!).then(
                        () => toast.add({ title: 'Code copied', type: 'success' }),
                        () => toast.add({ title: 'Could not copy code', type: 'error' })
                      )
                    }}
                  >
                    Copy code
                  </Button>
                </div>
              )}
              {pending.url && (
                <a
                  className={buttonVariants({ variant: 'secondary' })}
                  href={manualLogin ? (pending.codeUrl ?? pending.url) : pending.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open browser
                </a>
              )}
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
            <Button disabled={action.isPending} onClick={() => action.mutate('start')}>
              {action.isPending ? 'Starting sign-in…' : 'Log in'}
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
