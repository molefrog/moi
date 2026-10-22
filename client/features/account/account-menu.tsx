import { Link } from 'wouter'
import { IconLogout, IconMessage2Share, IconSettings } from '@tabler/icons-react'
import { Button } from '@/client/components/ui/button'
import { Skeleton } from '@/client/components/ui/skeleton'
import { toast } from '@/client/components/ui/toast'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/client/components/ui/dropdown-menu'
import { UserAvatar } from '@/client/features/collab/components/user-avatar'
import { User } from '@/client/features/collab/components/user'
import { useAccount } from './account-provider'

const FEEDBACK_URL = 'https://mlfrg.notion.site/3c678a44b6788042b734d775dd2e935e?pvs=105'

export function AccountMenu() {
  const account = useAccount()

  if (account.status === 'loading')
    return (
      <div className="flex size-10 items-center justify-center">
        <Skeleton className="size-8 rounded-full" aria-label="Loading account" />
      </div>
    )

  if (account.status === 'error') return null

  if (account.status === 'signed-out' || !account.profile) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon-lg" aria-label="User menu" />}
      >
        <UserAvatar profile={account.profile} size="sm" />
      </DropdownMenuTrigger>

      <DropdownMenuContent side="right" align="end" sideOffset={8} className="w-52">
        <div className="px-2 py-1">
          <User
            profile={account.profile}
            size="sm"
            description={
              account.cloud
                ? account.profile.name?.trim()
                  ? account.email
                  : undefined
                : 'This computer'
            }
          />
        </div>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuItem render={<a href={FEEDBACK_URL} target="_blank" rel="noreferrer" />}>
            <IconMessage2Share stroke={1.75} />
            Leave feedback
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link href="/settings" />}>
            <IconSettings stroke={1.75} />
            Settings
          </DropdownMenuItem>
        </DropdownMenuGroup>

        {account.registered && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                disabled={account.signOut.isPending}
                onClick={() =>
                  account.signOut.mutate(undefined, {
                    onError: error =>
                      toast.add({
                        title: 'Couldn’t sign out',
                        description: error.message,
                        type: 'error'
                      })
                  })
                }
              >
                <IconLogout stroke={1.75} />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
