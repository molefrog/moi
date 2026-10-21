import type { PresenceGroupProps as PresenceGroupContainerProps } from 'moi/collab'
import type { ReactNode } from 'react'
import { useContext, useId, useMemo } from 'react'
import { LayoutGroup, MotionConfig } from 'motion/react'
import { presenceTarget } from '../presence-target'
import { PresenceGroupContext } from './presence-helpers'

export function PresenceGroupContainer({ id, children }: PresenceGroupContainerProps) {
  const parent = useContext(PresenceGroupContext)
  const scope = useMemo(() => {
    presenceTarget(id)
    return [...parent, id]
  }, [parent, id])
  return (
    <PresenceGroup>
      <PresenceGroupContext value={scope}>{children}</PresenceGroupContext>
    </PresenceGroup>
  )
}

export type PresenceGroupProps = { children: ReactNode }

export function PresenceGroup({ children }: PresenceGroupProps) {
  // Keep avatar animations inside this particular rendered group.
  const animationId = useId()
  return (
    <MotionConfig reducedMotion="user">
      <LayoutGroup id={animationId}>{children}</LayoutGroup>
    </MotionConfig>
  )
}
