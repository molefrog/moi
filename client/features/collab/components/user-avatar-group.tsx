import type { UserAvatarGroupProps as UserAvatarGroupContainerProps } from 'moi/collab'
import type { UserProfile } from '@/lib/collab/types'
import { AvatarGroup as AvatarGroupPrimitive, AvatarGroupCount } from '@/ui-components/avatar'
import { UserAvatar } from './user-avatar'
import type { UserAvatarProps } from './user-avatar'
import { useUsers } from '../hooks'

export function UserAvatarGroupContainer({ ids, ...props }: UserAvatarGroupContainerProps) {
  const users = useUsers([...new Set(ids)])
  return <UserAvatarGroup users={users} {...props} />
}

export type UserAvatarGroupProps = {
  users: readonly (UserProfile | undefined)[]
  max?: number
  size?: UserAvatarProps['size']
  className?: string
}

export function UserAvatarGroup({ users, max = 3, size = 'sm', className }: UserAvatarGroupProps) {
  const shown = users.slice(0, max)
  const hidden = users.length - shown.length
  return (
    <AvatarGroupPrimitive className={className} aria-label={`${users.length} users`}>
      {shown.map((profile, index) => (
        <UserAvatar key={profile?.id ?? index} profile={profile} size={size} />
      ))}
      {hidden > 0 && (
        <AvatarGroupCount size={size} aria-label={`${hidden} more`}>
          +{hidden}
        </AvatarGroupCount>
      )}
    </AvatarGroupPrimitive>
  )
}
