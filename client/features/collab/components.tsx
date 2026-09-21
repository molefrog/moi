import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import type { FocusEvent, PointerEvent, ReactNode, RefObject } from 'react'

import { IconCursorText, IconPointer } from '@tabler/icons-react'

import { cn } from '@/client/lib/cn'
import type { CollabJsonValue, CollabParticipant } from '@/lib/collab/types'

import { presenceChannels, useOthers, usePresenceChannel, useSelf } from './hooks'
import { Cursor, Facepile, PresenceFrame } from './primitives'

// Connected collab components: the primitives from primitives.tsx fed by the
// workspace connection and the current applet's presence.
export { Cursor, Facepile, Person, PresenceFrame, PresenceGutter } from './primitives'

export function uniqueParticipants(participants: CollabParticipant[]): CollabParticipant[] {
  return [
    ...new Map(participants.map(participant => [participant.identity.id, participant])).values()
  ]
}

export type ActivityProps = { scope?: 'page' | 'workspace'; className?: string }
export function Activity({ scope = 'page', className }: ActivityProps) {
  const others = useOthers({ scope })
  const self = useSelf()
  const participants = self ? [self, ...others] : others
  return (
    <Facepile
      ids={participants.map(participant => participant.identity.id)}
      max={participants.length}
      className={className}
    />
  )
}

type PointerPosition = { x: number; y: number; target?: string; targetX?: number; targetY?: number }
function pointerPosition(value: CollabJsonValue): PointerPosition | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  if (typeof value.x !== 'number' || typeof value.y !== 'number') return null
  return {
    x: value.x,
    y: value.y,
    ...(typeof value.target === 'string' ? { target: value.target } : {}),
    ...(typeof value.targetX === 'number' ? { targetX: value.targetX } : {}),
    ...(typeof value.targetY === 'number' ? { targetY: value.targetY } : {})
  }
}

export type CursorsProps = { surface?: string; children: ReactNode; className?: string }
export function Cursors({ surface = 'default', children, className }: CursorsProps) {
  const root = useRef<HTMLDivElement>(null)
  const cursor = usePresenceChannel<CollabJsonValue>(presenceChannels.cursor(surface), null)
  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch') return
    const element = root.current
    if (!element) return
    const bounds = element.getBoundingClientRect()
    const target =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>('[data-collab-target]')
        : null
    const anchor = target && element.contains(target) ? target : null
    const rect = anchor?.getBoundingClientRect()
    cursor.setValue({
      x: event.clientX - bounds.left + element.scrollLeft,
      y: event.clientY - bounds.top + element.scrollTop,
      ...(anchor && rect
        ? {
            target: anchor.dataset.collabTarget ?? '',
            targetX: rect.width ? (event.clientX - rect.left) / rect.width : 0,
            targetY: rect.height ? (event.clientY - rect.top) / rect.height : 0
          }
        : {})
    })
  }
  return (
    <div
      ref={root}
      className={cn('relative', className)}
      onPointerMove={move}
      onPointerLeave={() => cursor.setValue(null)}
    >
      {children}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        {cursor.others.map(({ participant, value }) => {
          const point = pointerPosition(value)
          return point ? (
            <RemoteCursor
              key={participant.connectionId}
              root={root}
              point={point}
              id={participant.identity.id}
            />
          ) : null
        })}
      </div>
    </div>
  )
}

type RemoteCursorProps = {
  root: RefObject<HTMLDivElement | null>
  point: PointerPosition
  id: string
}
// Anchored points follow their target element through scrolling and layout
// changes, so the position is applied to the node directly rather than
// re-rendered on every scroll event.
function RemoteCursor({ root, point, id }: RemoteCursorProps) {
  const marker = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const element = root.current
    const node = marker.current
    if (!element || !node) return
    const position = () => {
      let x = point.x - element.scrollLeft
      let y = point.y - element.scrollTop
      if (point.target) {
        const target = [...element.querySelectorAll<HTMLElement>('[data-collab-target]')].find(
          candidate => candidate.dataset.collabTarget === point.target
        )
        if (!target) {
          node.hidden = true
          return
        }
        const bounds = element.getBoundingClientRect()
        const rect = target.getBoundingClientRect()
        x = rect.left - bounds.left + rect.width * (point.targetX ?? 0)
        y = rect.top - bounds.top + rect.height * (point.targetY ?? 0)
      }
      node.hidden = false
      node.style.transform = `translate(${x}px, ${y}px)`
    }
    position()
    const observer = new ResizeObserver(position)
    observer.observe(element)
    element.addEventListener('scroll', position, true)
    window.addEventListener('resize', position)
    return () => {
      observer.disconnect()
      element.removeEventListener('scroll', position, true)
      window.removeEventListener('resize', position)
    }
  }, [root, point])
  return <Cursor ref={marker} id={id} />
}

type PresenceOutlineProps = {
  people: CollabParticipant[]
  icon: ReactNode
  children: ReactNode
  target: string
  className?: string
  onFocusCapture?: (event: FocusEvent<HTMLDivElement>) => void
  onBlurCapture?: (event: FocusEvent<HTMLDivElement>) => void
}
function PresenceOutline({ people, target, ...rest }: PresenceOutlineProps) {
  return (
    <PresenceFrame
      data-collab-target={target}
      ids={people.map(person => person.identity.id)}
      {...rest}
    />
  )
}

export type PresenceFieldProps = { target: string; children: ReactNode; className?: string }
export function PresenceField({ target, children, className }: PresenceFieldProps) {
  const presence = usePresenceChannel<boolean>(presenceChannels.field(target), false)
  const people = useMemo(
    () =>
      uniqueParticipants(
        presence.others.filter(other => other.value === true).map(other => other.participant)
      ),
    [presence.others]
  )
  return (
    <PresenceOutline
      target={target}
      people={people}
      icon={<IconCursorText size={12} stroke={1.75} />}
      className={className}
      onFocusCapture={() => presence.setValue(true)}
      onBlurCapture={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          presence.setValue(false)
      }}
    >
      {children}
    </PresenceOutline>
  )
}

export type SelectionProps = {
  target: string
  selected: boolean
  children: ReactNode
  className?: string
}
export function Selection({ target, selected, children, className }: SelectionProps) {
  const { setValue, others } = usePresenceChannel<boolean>(
    presenceChannels.selection(target),
    selected
  )
  useEffect(() => setValue(selected), [selected, setValue])
  const people = useMemo(
    () =>
      uniqueParticipants(
        others.filter(other => other.value === true).map(other => other.participant)
      ),
    [others]
  )
  return (
    <PresenceOutline
      target={target}
      people={people}
      icon={<IconPointer size={12} stroke={1.75} />}
      className={className}
    >
      {children}
    </PresenceOutline>
  )
}
