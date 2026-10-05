import type { UserAvatarGroupProps } from 'moi/collab'
import { AvatarGroup as AvatarGroupPrimitive, AvatarGroupCount } from '@/ui-components/avatar'
import { UserAvatar } from './user-avatar'

export function UserAvatarGroup({ ids, max = 3, size = 'sm', className }: UserAvatarGroupProps) {
  const unique = [...new Set(ids)]
  const shown = unique.slice(0, max)
  const hidden = unique.length - shown.length

  return (
    <AvatarGroupPrimitive className={className} aria-label={`${unique.length} users`}>
      {shown.map(id => (
        <UserAvatar key={id} id={id} size={size} />
      ))}
      {hidden > 0 && (
        <AvatarGroupCount size={size} aria-label={`${hidden} more`}>
          +{hidden}
        </AvatarGroupCount>
      )}
    </AvatarGroupPrimitive>
  )
}
