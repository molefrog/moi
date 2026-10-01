import type { SelectionProps } from 'moi/collab'
import { IconPointer } from '@tabler/icons-react'
import { presenceChannels, usePresenceChannel, usePublishPresenceChannel } from '../hooks'
import { PresenceOutline } from './focus-frame'
import { hasPresence, usePresenceTarget } from './presence-helpers'

export function Selection({ id, selected, children, className }: SelectionProps) {
  const target = usePresenceTarget(id)
  const channel = presenceChannels.selection(target)
  usePublishPresenceChannel(channel, selected, hasPresence)
  const others = usePresenceChannel<boolean>(channel)
  const ids = [...new Set(others.filter(other => other.value === true).map(other => other.userId))]
  return (
    <PresenceOutline
      data-collab-target={target}
      ids={ids}
      icon={<IconPointer size={12} stroke={1.75} />}
      className={className}
    >
      {children}
    </PresenceOutline>
  )
}
