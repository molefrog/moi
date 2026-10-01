import type { PresenceGroupProps } from 'moi/collab'
import { useContext, useId, useMemo } from 'react'
import { LayoutGroup, MotionConfig } from 'motion/react'
import { presenceTarget } from '../presence-target'
import { PresenceGroupContext } from './presence-helpers'

export function PresenceGroup({ id, children }: PresenceGroupProps) {
  const parent = useContext(PresenceGroupContext)
  const scope = useMemo(() => {
    presenceTarget(id)
    return [...parent, id]
  }, [parent, id])
  // The shared path identifies data across browsers; the generated ID keeps
  // avatar animations inside this particular rendered group.
  const animationId = useId()
  return (
    <MotionConfig reducedMotion="user">
      <LayoutGroup id={animationId}>
        <PresenceGroupContext value={scope}>{children}</PresenceGroupContext>
      </LayoutGroup>
    </MotionConfig>
  )
}
