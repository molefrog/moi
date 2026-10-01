import type { PresenceAvatarsProps } from 'moi/collab'
import { useContext } from 'react'
import type { HTMLAttributes, ReactNode, Ref } from 'react'
import { motion } from 'motion/react'
import { cn } from '@/client/lib/cn'
import { PresenceGroupContext, usePresenceTarget, useTargetPresence } from './presence-helpers'
import { UserAvatar } from './user-avatar'

export function PresenceAvatars({ id, present, children, className }: PresenceAvatarsProps) {
  const target = usePresenceTarget(id)
  const presence = useTargetPresence(target, present)
  const grouped = useContext(PresenceGroupContext).length > 0
  return (
    <PresenceAvatarsPrimitive
      {...presence.props}
      users={presence.users}
      // Controlled presence can occupy several targets at once; only focus moves between them.
      animate={grouped && present === undefined}
      className={className}
    >
      {children}
    </PresenceAvatarsPrimitive>
  )
}

type PresenceAvatarsPrimitiveProps = HTMLAttributes<HTMLDivElement> & {
  ref?: Ref<HTMLDivElement>
  users: readonly { id: string; connectionId: string }[]
  children: ReactNode
  animate?: boolean
}

// A target owns its own gutter. Optional group-scoped layout IDs let the same
// user's face glide between targets without searching or guessing DOM order.
function PresenceAvatarsPrimitive({
  users,
  children,
  animate = false,
  className,
  ...rest
}: PresenceAvatarsPrimitiveProps) {
  return (
    <div className={cn('relative pl-8', className)} {...rest}>
      {children}
      <div className="pointer-events-none absolute top-0 left-0 flex -space-x-3" aria-hidden="true">
        {users.map(({ id, connectionId }) => (
          <motion.span key={id} layoutId={animate ? `presence:${connectionId}` : undefined}>
            <UserAvatar id={id} size="sm" className="animate-in duration-200 zoom-in-75 fade-in" />
          </motion.span>
        ))}
      </div>
    </div>
  )
}
