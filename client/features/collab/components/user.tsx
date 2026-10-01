import type { UserProps, WorkspaceUser } from 'moi/collab'
import { IconUser } from '@tabler/icons-react'
import { Facehash } from 'facehash'
import { cn } from '@/client/lib/cn'
import { Avatar, AvatarBadge, AvatarFallback, AvatarImage } from '@/ui-components/avatar'
import { useUser } from '../hooks'
import { userDisplayName } from '../users'

const UNKNOWN_NAME = 'Unknown user'

export function User({
  id,
  size = 'default',
  avatarOnly = false,
  you = false,
  detail,
  showStatus = true,
  label,
  className
}: UserProps) {
  const user = useUser(id)
  const name = user ? userDisplayName(user) : UNKNOWN_NAME
  const compact = size === 'xs'
  const avatar = (
    <UserAvatar
      user={user}
      name={name}
      size={size}
      showStatus={showStatus}
      label={label}
      className={avatarOnly ? className : undefined}
    />
  )
  if (avatarOnly) return avatar
  return (
    <span
      className={cn(
        'inline-flex min-w-0 items-center',
        size === 'lg' ? 'gap-3' : compact ? 'gap-1.5' : 'gap-2',
        className
      )}
    >
      {avatar}
      <span className={cn('flex min-w-0', compact ? 'items-baseline gap-1' : 'flex-col')}>
        <span
          className={cn(
            'truncate text-sm',
            size === 'lg' && 'font-medium',
            !user && 'text-muted-foreground'
          )}
        >
          {name}
          {you && <span className="font-normal text-muted-foreground"> (you)</span>}
        </span>
        {detail && (
          <span className="truncate text-xs text-muted-foreground">
            {compact && <span aria-hidden="true">· </span>}
            {detail}
          </span>
        )}
      </span>
    </span>
  )
}

type UserAvatarProps = {
  user: WorkspaceUser | undefined
  name: string
  size: NonNullable<UserProps['size']>
  showStatus: boolean
  label?: string
  className?: string
}

function UserAvatar({ user, name, size, showStatus, label, className }: UserAvatarProps) {
  const smallAvatar = size === 'xs' || size === 'sm'
  return (
    <Avatar
      size={size}
      title={label ?? name}
      aria-label={label ?? name}
      data-collab-color={user?.color ?? 'unknown'}
      className={className}
    >
      {user?.avatar && <AvatarImage src={user.avatar} alt="" />}
      <AvatarFallback>
        {user ? (
          <Facehash
            name={name}
            size="100%"
            variant="solid"
            intensity3d="none"
            interactive={false}
            colorClasses={['bg-collab']}
            className="rounded-full text-collab-foreground"
          />
        ) : (
          <IconUser size={smallAvatar ? 12 : 16} stroke={1.75} />
        )}
      </AvatarFallback>
      {showStatus && user?.status === 'active' && <AvatarBadge className="bg-success" />}
    </Avatar>
  )
}
