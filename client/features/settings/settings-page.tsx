import { useEffect } from 'react'
import { Redirect } from 'wouter'
import { Button } from '@/client/components/ui/button'
import { Skeleton } from '@/client/components/ui/skeleton'
import { useAccount } from '../account/account-provider'
import { YouSettings } from './you-settings'
import { TeamSettings } from './team-settings'

export function SettingsPage() {
  const account = useAccount()
  useEffect(() => {
    if (account.cloud && !account.demo && account.status === 'signed-out') {
      window.location.replace('/cloud/login')
    }
  }, [account.cloud, account.demo, account.status, account.registered])
  if (account.demo) return <Redirect to="/" replace />
  if (account.status === 'signed-out') return null
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-8 sm:px-10 sm:py-12">
        <h1 className="text-xl font-medium">Settings</h1>
        {account.status === 'loading' ? (
          <div className="flex flex-col gap-4" aria-label="Loading settings">
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-10 w-full max-w-md" />
            <Skeleton className="h-10 w-full max-w-md" />
          </div>
        ) : account.status === 'error' ? (
          <div className="flex flex-col items-start gap-3">
            <p role="alert">Couldn’t load your account</p>
            <Button variant="outline" onClick={account.retry}>
              Try again
            </Button>
          </div>
        ) : (
          <div className="flex w-full max-w-xl min-w-0 flex-col gap-4">
            <YouSettings />
            {account.registered && <TeamSettings />}
          </div>
        )}
      </div>
    </div>
  )
}
