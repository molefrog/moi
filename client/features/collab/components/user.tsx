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
  description,
  className
}: UserProps) {
  const user = useUser(id)
  const name = user ? userDisplayName(user) : UNKNOWN_NAME

  return (
    <span className={cn('inline-flex min-w-0 items-center gap-2', className)}>
      <UserAvatar id={id} size={size} showStatusBadge={showStatusBadge} />
      <span className={cn('flex min-w-0 text-sm', size === 'xs' ? 'items-baseline' : 'flex-col')}>
        <span className={cn('truncate', !user && 'text-muted-foreground')}>{name}</span>
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
