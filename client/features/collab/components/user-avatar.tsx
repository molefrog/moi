import type { UserAvatarProps } from 'moi/collab'
import { IconUser } from '@tabler/icons-react'
import { Facehash } from 'facehash'
import { Avatar, AvatarBadge, AvatarFallback, AvatarImage } from '@/ui-components/avatar'
import { useUser } from '../hooks'
import { userDisplayName } from '../users'

export function UserAvatar({
  id,
  size = 'default',
  showStatusBadge = true,
  className
}: UserAvatarProps) {
  const user = useUser(id)
  const name = user ? userDisplayName(user) : 'Unknown user'
  const smallAvatar = size === 'xs' || size === 'sm'

  return (
    <Avatar
      size={size}
      title={name}
      aria-label={name}
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
            className="text-collab-foreground"
          />
        ) : (
          <IconUser size={smallAvatar ? 12 : 16} stroke={1.75} />
        )}
      </AvatarFallback>
      {showStatusBadge && user?.status === 'active' && <AvatarBadge className="bg-success" />}
    </Avatar>
  )
}
