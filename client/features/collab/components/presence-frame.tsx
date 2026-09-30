import type { PresenceFrameProps } from 'moi/collab'
import { useLayoutEffect, useRef } from 'react'
import type { HTMLAttributes, ReactNode, Ref } from 'react'
import { IconCursorText } from '@tabler/icons-react'
import { cn } from '@/client/lib/cn'
import type { UserColor } from '@/lib/collab/colors'
import { useUsers } from '../hooks'
import { userDisplayName } from '../users'
import { presenceChild, usePresenceTarget, useTargetPresence } from './presence-helpers'
import { UserTag } from './user-tag'
export type { PresenceFrameProps } from 'moi/collab'

export function PresenceFrame({ id, children, className }: PresenceFrameProps) {
  const target = usePresenceTarget(id)
  const presence = useTargetPresence(target)
  return (
    <PresenceFramePrimitive
      {...presence.props}
      ids={presence.users.map(user => user.id)}
      icon={<IconCursorText size={12} stroke={1.75} />}
      className={className}
    >
      {presenceChild(children)}
    </PresenceFramePrimitive>
  )
}

export type PresenceFramePrimitiveProps = HTMLAttributes<HTMLDivElement> & {
  ref?: Ref<HTMLDivElement>
  // Everyone at this element; the first user's color draws the frame.
  ids: readonly string[]
  icon?: ReactNode
  children: ReactNode
}

// Wraps anything. With one element inside, the frame hugs that element and
// takes its corner radius, so a field, a card, a button, and a round avatar
// each get a frame of their own shape with no styling from the caller.
export function PresenceFramePrimitive({
  ids,
  icon,
  children,
  className,
  ...rest
}: PresenceFramePrimitiveProps) {
  const resolved = useUsers(ids).filter(user => user !== undefined)
  const lead = resolved[0]
  return (
    <div className={cn('relative', className)} {...rest}>
      {children}
      {lead && (
        <FrameOutline
          names={resolved.map(userDisplayName).join(', ')}
          color={lead.color}
          icon={icon}
        />
      )}
    </div>
  )
}

// A name does not fit within a frame narrower than this, so its tag starts at
// the frame's left edge and runs past it instead of ending at the right edge.
const NARROW_FRAME = 160

const CORNERS = [
  'borderTopLeftRadius',
  'borderTopRightRadius',
  'borderBottomRightRadius',
  'borderBottomLeftRadius'
] as const

type FrameOutlineProps = { names: string; color: UserColor | undefined; icon?: ReactNode }

function FrameOutline({ names, color, icon }: FrameOutlineProps) {
  const node = useRef<HTMLDivElement | null>(null)
  // Runs after every render, because whatever is wrapped may have changed shape
  // in the same render, and again whenever the wrapped element resizes.
  useLayoutEffect(() => {
    const outline = node.current
    const frame = outline?.parentElement
    if (!outline || !frame) return
    const fit = () => {
      // The one in-flow element inside is what the frame is about; hidden
      // inputs and other out-of-flow helpers beside it do not count. With
      // several elements, or bare text, the frame goes around all of it.
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
      const box = outline.style
      box.left = subject ? `${subject.offsetLeft}px` : ''
      box.top = subject ? `${subject.offsetTop}px` : ''
      box.right = subject ? 'auto' : ''
      box.bottom = subject ? 'auto' : ''
      box.width = subject ? `${subject.offsetWidth}px` : ''
      box.height = subject ? `${subject.offsetHeight}px` : ''
      // Square elements, usually bare text, keep the outline's own slight
      // rounding and get more air so the content does not touch the line.
      const shape = getComputedStyle(subject ?? frame)
      const rounded = CORNERS.some(corner => parseFloat(shape[corner]) > 0)
      for (const corner of CORNERS) box[corner] = rounded ? shape[corner] : ''
      // Both states are spelled out, and every class that depends on them is a
      // variant: inside an applet, the applet's own copy of a bare utility
      // outranks a host variant that tries to override it.
      outline.dataset.shape = rounded ? 'rounded' : 'square'
      outline.dataset.tag = (subject ?? frame).offsetWidth < NARROW_FRAME ? 'start' : 'end'
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
      data-collab-color={color ?? 'unknown'}
      className="group/frame pointer-events-none absolute inset-0 animate-in rounded-sm outline-2 outline-collab duration-150 fade-in data-[shape=rounded]:outline-offset-2 data-[shape=square]:outline-offset-4"
    >
      <UserTag
        name={names}
        color={color}
        icon={icon}
        className="absolute bottom-full group-data-[shape=rounded]/frame:mb-1.5 group-data-[shape=square]/frame:mb-2 group-data-[tag=end]/frame:right-0 group-data-[tag=end]/frame:max-w-full group-data-[tag=start]/frame:left-0 group-data-[tag=start]/frame:max-w-40"
      />
    </div>
  )
}
