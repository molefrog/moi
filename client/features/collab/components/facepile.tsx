import type { FacepileProps } from 'moi/collab'
import { cn } from '@/client/lib/cn'
import { Avatar, AvatarFallback } from '@/ui-components/avatar'
import { UserAvatar } from './user-avatar'

export function Facepile({
  ids,
  max = 3,
  size = 'sm',
  showStatusBadge = false,
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
        <UserAvatar
          key={id}
          id={id}
          size={size}
          showStatusBadge={showStatusBadge}
          className="ring-2 ring-background"
        />
      ))}
      {hidden > 0 && (
        <Avatar size={size} className="ring-2 ring-background" title={`${hidden} more`}>
          <AvatarFallback>+{hidden}</AvatarFallback>
        </Avatar>
      )}
    </span>
  )
}
