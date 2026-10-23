import type { PresenceFrameProps as PresenceFrameContainerProps } from 'moi/collab'
import type { UserProfile } from '@/lib/collab/types'
import { useLayoutEffect, useRef } from 'react'
import type { HTMLAttributes, ReactNode, Ref } from 'react'
import { cn } from '@/client/lib/cn'
import type { UserColor } from '@/lib/collab/colors'
import { Badge } from '@/ui-components/badge'
import { useUsers } from '../hooks'
import { userDisplayName } from '@/client/lib/user-display-name'
import { usePresenceTarget, useTargetPresence } from './presence-helpers'

export function PresenceFrameContainer({
  id,
  present,
  align,
  children,
  className
}: PresenceFrameContainerProps) {
  const target = usePresenceTarget(id)
  const presence = useTargetPresence(target, present)
  const users = useUsers(presence.users.map(user => user.id)).filter(user => user !== undefined)
  return (
    <PresenceFrame {...presence.props} users={users} align={align} className={className}>
      {children}
    </PresenceFrame>
  )
}

export type PresenceFrameProps = HTMLAttributes<HTMLDivElement> & {
  ref?: Ref<HTMLDivElement>
  // Everyone at this element; the first user's color draws the frame.
  users: readonly UserProfile[]
  children: ReactNode
  align?: PresenceFrameContainerProps['align']
}

// One visible element gets a frame matching its shape; other content gets one shared frame.
export function PresenceFrame({ users, align, children, className, ...rest }: PresenceFrameProps) {
  return (
    <div className={cn('relative', className)} {...rest}>
      {/* Keep the overlay first so showing it never changes the content's spacing. */}
      <FrameOutline
        names={users.map(userDisplayName).join(', ')}
        color={users[0]?.color}
        align={align}
      />
      {children}
    </div>
  )
}

const FRAME_GAP = 4
const FRAME_RADIUS = 6

const CORNERS = [
  'borderTopLeftRadius',
  'borderTopRightRadius',
  'borderBottomRightRadius',
  'borderBottomLeftRadius'
] as const

type FrameOutlineProps = {
  names: string
  color: UserColor | undefined
  align?: PresenceFrameContainerProps['align']
}

function FrameOutline({ names, color, align = 'end' }: FrameOutlineProps) {
  const node = useRef<HTMLDivElement | null>(null)
  // Refit after rendering and whenever the content resizes.
  useLayoutEffect(() => {
    const outline = node.current
    const frame = outline?.parentElement
    if (!names || !outline || !frame) return
    const fit = () => {
      // Ignore the overlay, hidden elements, and helpers outside normal flow.
      const inside = [...frame.children].filter(child => {
        if (child === outline) return false
        const { display, position } = getComputedStyle(child)
        return display !== 'none' && position !== 'absolute' && position !== 'fixed'
      })
      const bareText = [...frame.childNodes].some(
        child => child.nodeType === Node.TEXT_NODE && child.textContent?.trim()
      )
      const only = inside.length === 1 && !bareText ? inside[0] : null
      const subject = only instanceof HTMLElement ? only : null
      const target = subject ?? frame
      const bounds = target.getBoundingClientRect()
      const origin = frame.getBoundingClientRect()
      const box = outline.style
      // Rectangles preserve fractions; absolute positions start inside the wrapper's border.
      box.left = `${bounds.left - origin.left - frame.clientLeft + frame.scrollLeft - FRAME_GAP}px`
      box.top = `${bounds.top - origin.top - frame.clientTop + frame.scrollTop - FRAME_GAP}px`
      box.width = `${bounds.width + FRAME_GAP * 2}px`
      box.height = `${bounds.height + FRAME_GAP * 2}px`
      box.setProperty('--presence-target-width', `${bounds.width}px`)
      // Expand one element's corners by the gap; otherwise use the default radius.
      const shape = subject ? getComputedStyle(subject) : null
      for (const corner of CORNERS) {
        box[corner] = shape ? `calc(${shape[corner]} + ${FRAME_GAP}px)` : `${FRAME_RADIUS}px`
      }
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(frame)
    for (const child of frame.children) if (child !== outline) observer.observe(child)
    return () => observer.disconnect()
  })
  return (
    <div
      ref={node}
      hidden={!names}
      data-align={align}
      data-collab-color={color ?? 'unknown'}
      className="group/frame pointer-events-none absolute m-0! animate-in ring-2 ring-collab duration-150 fade-in"
    >
      <Badge className="absolute bottom-full mb-1.5 max-w-[min(var(--presence-target-width),10rem)] bg-collab text-collab-foreground group-data-[align=end]/frame:-right-0.5 group-data-[align=start]/frame:-left-0.5">
        <span className="truncate">{names}</span>
      </Badge>
    </div>
  )
}
