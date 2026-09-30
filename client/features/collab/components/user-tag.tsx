import type { ReactNode } from 'react'
import { cn } from '@/client/lib/cn'
import type { UserColor } from '@/lib/collab/colors'
import { Badge } from '@/ui-components/badge'

type UserTagProps = {
  name: string
  color: UserColor | undefined
  icon?: ReactNode
  className?: string
}

// The kit's badge in the user's color, wherever a name marks a place.
export function UserTag({ name, color, icon, className }: UserTagProps) {
  return (
    <Badge
      data-collab-color={color ?? 'unknown'}
      className={cn('bg-collab text-collab-foreground', className)}
    >
      {icon}
      <span className="truncate">{name}</span>
    </Badge>
  )
}
