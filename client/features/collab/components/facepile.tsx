import type { FacepileProps } from 'moi/collab'
import { cn } from '@/client/lib/cn'
import { Avatar, AvatarFallback } from '@/ui-components/avatar'
import { AVATAR_SIZE, User } from './user'
export type { FacepileProps } from 'moi/collab'

export function Facepile({
  ids,
  max = 3,
  size = 'sm',
  showStatus = false,
  className
}: FacepileProps) {
  const unique = [...new Set(ids)]
  const shown = unique.slice(0, max)
  const hidden = unique.length - shown.length
  return (
    <span
      className={cn(
        'inline-flex items-center',
        size === 'xs' ? '-space-x-1.5' : '-space-x-2',
        className
      )}
      aria-label={`${unique.length} users`}
    >
      {shown.map(id => (
        <User
          key={id}
          id={id}
          avatarOnly
          size={size}
          showStatus={showStatus}
          className="ring-2 ring-background"
        />
      ))}
      {hidden > 0 && (
        <Avatar
          size={AVATAR_SIZE[size]}
          className="ring-2 ring-background"
          title={`${hidden} more`}
        >
          <AvatarFallback>+{hidden}</AvatarFallback>
        </Avatar>
      )}
    </span>
  )
}
