import type { UserProps } from 'moi/collab'
import { cn } from '@/client/lib/cn'
import { UserAvatar } from './user-avatar'
import { useUser } from '../hooks'
import { userDisplayName } from '../users'

const UNKNOWN_NAME = 'Unknown user'

export function User({
  id,
  size = 'default',
  showStatusBadge = true,
  detail,
  className
}: UserProps) {
  const user = useUser(id)
  const name = user ? userDisplayName(user) : UNKNOWN_NAME

  return (
    <span
      className={cn(
        'inline-flex min-w-0 items-center',
        size === 'lg' ? 'gap-3' : size === 'xs' ? 'gap-1.5' : 'gap-2',
        className
      )}
    >
      <UserAvatar id={id} size={size} showStatusBadge={showStatusBadge} />
      <span className={cn('flex min-w-0', size === 'xs' ? 'items-baseline gap-1' : 'flex-col')}>
        <span
          className={cn(
            'truncate text-sm',
            size === 'lg' && 'font-medium',
            !user && 'text-muted-foreground'
          )}
        >
          {name}
        </span>
        {detail && (
          <span className="truncate text-xs text-muted-foreground">
            {size === 'xs' && <span aria-hidden="true">· </span>}
            {detail}
          </span>
        )}
      </span>
    </span>
  )
}
