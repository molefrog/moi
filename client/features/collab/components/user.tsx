import type { UserProps } from 'moi/collab'
import { IconUser } from '@tabler/icons-react'
import { Facehash } from 'facehash'
import { cn } from '@/client/lib/cn'
import { Avatar, AvatarBadge, AvatarFallback, AvatarImage } from '@/ui-components/avatar'
import { useUser } from '../hooks'
import { userDisplayName } from '../users'
export type { UserProps, UserSize } from 'moi/collab'

type UserFaceProps = { name: string }

export function UserFace({ name }: UserFaceProps) {
  return (
    <Facehash
      name={name}
      size="100%"
      variant="solid"
      intensity3d="none"
      interactive={false}
      colorClasses={['bg-collab']}
      className="rounded-full text-collab-foreground"
    />
  )
}

// User components resolve IDs through the current workspace directory,
// which resolves to the current name, face, and status through the workspace.

export const AVATAR_SIZE = { xs: 'xs', sm: 'sm', md: 'default', lg: 'lg' } as const

// Shown for an id nobody in this workspace has ever used.
const UNKNOWN_NAME = 'Unknown user'

export function User({
  id,
  size = 'md',
  avatarOnly = false,
  you = false,
  detail,
  showStatus = true,
  label,
  className
}: UserProps) {
  const user = useUser(id)
  const name = user ? userDisplayName(user) : UNKNOWN_NAME
  // A profile without a picture gets the same generated face on every client,
  // so nobody shows up as bare initials.
  const compact = size === 'xs'
  const avatar = (
    <Avatar
      size={AVATAR_SIZE[size]}
      title={label ?? name}
      aria-label={label ?? name}
      data-collab-color={user?.color ?? 'unknown'}
      className={avatarOnly ? className : undefined}
    >
      {user?.avatar && <AvatarImage src={user.avatar} alt="" />}
      <AvatarFallback>
        {user ? (
          <UserFace name={name} />
        ) : (
          <IconUser size={size === 'xs' || size === 'sm' ? 12 : 16} stroke={1.75} />
        )}
      </AvatarFallback>
      {showStatus && user?.status === 'active' && <AvatarBadge className="bg-success" />}
    </Avatar>
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
