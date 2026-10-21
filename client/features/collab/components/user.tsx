import type { UserProps as UserContainerProps } from 'moi/collab'
import type { ReactNode } from 'react'
import type { UserProfile } from '@/lib/collab/types'
import { cn } from '@/client/lib/cn'
import { UserAvatar } from './user-avatar'
import { userDisplayName } from '@/client/lib/user-display-name'
import { useMe, useUser } from '../hooks'

export function UserContainer({ id, showStatusBadge, showYouLabel, ...props }: UserContainerProps) {
  const user = useUser(id)
  const me = useMe()
  return (
    <User
      {...props}
      profile={user}
      active={showStatusBadge && user?.status === 'active'}
      showYouLabel={showYouLabel && user !== undefined && user.id === me?.id}
    />
  )
}

export type UserProps = {
  profile?: UserProfile
  size?: 'xs' | 'sm' | 'default'
  active?: boolean
  showYouLabel?: boolean
  description?: ReactNode
  className?: string
}

export function User({
  profile: user,
  size = 'default',
  active,
  showYouLabel,
  description,
  className
}: UserProps) {
  const name = user ? userDisplayName(user) : 'Unknown user'

  return (
    <span className={cn('inline-flex min-w-0 items-center gap-2', className)}>
      <UserAvatar profile={user} size={size} active={active} />
      <span
        className={cn('flex min-w-0 flex-1 text-sm', size === 'xs' ? 'items-baseline' : 'flex-col')}
      >
        <span className="flex min-w-0 items-baseline gap-1">
          <span className={cn('truncate', !user && 'text-muted-foreground')}>{name}</span>
          {showYouLabel && <span className="shrink-0 text-muted-foreground">(You)</span>}
        </span>
        {description && (
          <span
            className={cn(
              'truncate text-muted-foreground',
              size === 'sm' && 'text-xs leading-tight'
            )}
          >
            {size === 'xs' && (
              <span aria-hidden="true" className="whitespace-pre">
                {' · '}
              </span>
            )}
            {description}
          </span>
        )}
      </span>
    </span>
  )
}
