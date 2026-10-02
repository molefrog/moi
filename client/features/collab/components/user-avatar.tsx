import type { UserAvatarProps } from 'moi/collab'
import { IconUser } from '@tabler/icons-react'
import { Blobatar } from '@blobatar/react'
import { Avatar, AvatarBadge, AvatarFallback, AvatarImage } from '@/ui-components/avatar'
import { useUser } from '../hooks'
import { userDisplayName } from '../users'

export function UserAvatar({ id, size = 'default', showStatusBadge, className }: UserAvatarProps) {
  const user = useUser(id)
  const name = user ? userDisplayName(user) : 'Unknown user'

  return (
    <Avatar
      size={size}
      aria-label={name}
      data-collab-color={user?.color ?? 'unknown'}
      className={className}
    >
      {user?.avatar && <AvatarImage src={user.avatar} alt="" />}
      <AvatarFallback>
        {user ? (
          <Blobatar
            name={id}
            animate="hover"
            background="circle"
            traits={{ shape: 0, 'body.r': 1 }}
            palette={{
              bg: 'var(--collab)',
              head: 'var(--collab)',
              eye: 'var(--collab-foreground)'
            }}
          />
        ) : (
          <IconUser size={size === 'xs' || size === 'sm' ? 12 : 16} stroke={1.75} />
        )}
      </AvatarFallback>
      {showStatusBadge && user?.status === 'active' && <AvatarBadge className="bg-success" />}
    </Avatar>
  )
}
