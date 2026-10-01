import type { PresenceGutterProps } from 'moi/collab'
import { useContext } from 'react'
import type { HTMLAttributes, ReactNode, Ref } from 'react'
import { motion } from 'motion/react'
import { cn } from '@/client/lib/cn'
import {
  PresenceGroupContext,
  presenceChild,
  usePresenceTarget,
  useTargetPresence
} from './presence-helpers'
import { User } from './user'

export function PresenceGutter({ id, children, className }: PresenceGutterProps) {
  const target = usePresenceTarget(id)
  const presence = useTargetPresence(target)
  const grouped = useContext(PresenceGroupContext).length > 0
  return (
    <PresenceGutterPrimitive
      {...presence.props}
      users={presence.users}
      animate={grouped}
      className={className}
    >
      {presenceChild(children)}
    </PresenceGutterPrimitive>
  )
}

type PresenceGutterPrimitiveProps = HTMLAttributes<HTMLDivElement> & {
  ref?: Ref<HTMLDivElement>
  users: readonly { id: string; connectionId: string }[]
  children: ReactNode
  animate?: boolean
}

// A target owns its own gutter. Optional group-scoped layout IDs let the same
// user's face glide between targets without searching or guessing DOM order.
function PresenceGutterPrimitive({
  users,
  children,
  animate = false,
  className,
  ...rest
}: PresenceGutterPrimitiveProps) {
  return (
    <div className={cn('relative pl-8', className)} {...rest}>
      {children}
      <div className="pointer-events-none absolute top-0 left-0 flex -space-x-3" aria-hidden="true">
        {users.map(({ id, connectionId }) => (
          <motion.span key={id} layoutId={animate ? `presence:${connectionId}` : undefined}>
            <User
              id={id}
              avatarOnly
              size="xs"
              showStatus={false}
              className="animate-in ring-2 ring-background duration-200 zoom-in-75 fade-in"
            />
          </motion.span>
        ))}
      </div>
    </div>
  )
}
