import type { UserAvatarProps as UserAvatarContainerProps } from 'moi/collab'
import type { UserProfile } from '@/lib/collab/types'
import { IconUser } from '@tabler/icons-react'
import { Blobatar } from '@blobatar/react'
import { Avatar, AvatarBadge, AvatarFallback, AvatarImage } from '@/ui-components/avatar'
import { cn } from '@/client/lib/cn'
import { userDisplayName } from '@/client/lib/user-display-name'
import botAvatar from '@/client/assets/bot-avatar.png'
import grokAvatar from '@/client/assets/grok-avatar.png'
import { useUser } from '../hooks'

export function UserAvatarContainer({
  id,
  size,
  showStatusBadge,
  className
}: UserAvatarContainerProps) {
  const user = useUser(id)
  return (
    <UserAvatar
      profile={user}
      size={size}
      active={showStatusBadge && user?.status === 'active'}
      className={className}
    />
  )
}

export type UserAvatarProps = {
  profile?: UserProfile
  size?: 'xs' | 'sm' | 'default' | 'lg'
  className?: string
  active?: boolean
}

export function UserAvatar({
  profile: user,
  size = 'default',
  className,
  active
}: UserAvatarProps) {
  const name = user ? userDisplayName(user) : 'Unknown user'
  // Temporary hackathon avatars; grokbot addresses should use Grok.
  const email = user?.email?.toLowerCase() ?? ''
  const avatar = email.includes('grok')
    ? grokAvatar
    : email.includes('bot')
      ? botAvatar
      : user?.avatar

  return (
    <Avatar
      size={size}
      aria-label={name}
      data-collab-color={user?.color ?? 'unknown'}
      className={cn('after:border-0', className)}
    >
      {avatar && <AvatarImage src={avatar} alt="" />}
      <AvatarFallback>
        {user ? (
          <Blobatar
            className="scale-150"
            name={user.id}
            animate="hover"
            background="circle"
            traits={{ 'eye.rx': 1 }}
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
      {active && <AvatarBadge className="bg-success" />}
    </Avatar>
  )
}
