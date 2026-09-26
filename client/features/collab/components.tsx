import { createContext, useContext, useId, useLayoutEffect, useRef } from 'react'
import type { FocusEvent, PointerEvent, ReactNode, RefObject } from 'react'

import { IconCursorText, IconPointer } from '@tabler/icons-react'
import { LayoutGroup, MotionConfig } from 'motion/react'

import { cn } from '@/client/lib/cn'
import type { CollabJsonValue } from '@/lib/collab/types'

import {
  presenceChannels,
  useMe,
  usePeers,
  usePresenceChannel,
  usePresencePublisher,
  usePublishPresenceChannel
} from './hooks'
import { Cursor, Facepile, PresenceFramePrimitive, PresenceGutterPrimitive } from './primitives'

export { Facepile, User } from './primitives'

// Built-in indicators have no registration while unfocused, unselected, or absent.
const hasPresence = (value: CollabJsonValue) => value !== false && value !== null

export type ActivityProps = { scope?: 'page' | 'workspace'; className?: string }
export function Activity({ scope = 'page', className }: ActivityProps) {
  const peers = usePeers({ scope })
  const me = useMe()
  const users = me ? [me, ...peers] : peers
  return <Facepile ids={users.map(user => user.id)} max={users.length} className={className} />
}

type PointerPosition = { x: number; y: number; target?: string; targetX?: number; targetY?: number }
function pointerPosition(value: CollabJsonValue): PointerPosition | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  if (typeof value.x !== 'number' || typeof value.y !== 'number') return null
  if (!Number.isFinite(value.x) || !Number.isFinite(value.y)) return null
  return {
    x: value.x,
    y: value.y,
    ...(typeof value.target === 'string' ? { target: value.target } : {}),
    ...(typeof value.targetX === 'number' && Number.isFinite(value.targetX)
      ? { targetX: value.targetX }
      : {}),
    ...(typeof value.targetY === 'number' && Number.isFinite(value.targetY)
      ? { targetY: value.targetY }
      : {})
  }
}

export type CursorsProps = { surface?: string; children: ReactNode; className?: string }
export function Cursors({ surface = 'default', children, className }: CursorsProps) {
  const root = useRef<HTMLDivElement>(null)
  const channel = presenceChannels.cursor(surface)
  const cursors = usePresenceChannel<CollabJsonValue>(channel)
  const publish = usePresencePublisher<CollabJsonValue>(channel, null, hasPresence)
  const byConnection = new Map<string, { id: string; point: PointerPosition }>()
  for (const { connectionId, userId, value } of cursors) {
    const point = pointerPosition(value)
    if (point) byConnection.set(connectionId, { id: userId, point })
  }
  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch') return
    const element = root.current
    if (
      !element ||
      !(event.target instanceof Element) ||
      event.target.closest('[data-collab-cursors]') !== element
    )
      return
    const bounds = element.getBoundingClientRect()
    const target =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>('[data-collab-target]')
        : null
    const anchor = target && element.contains(target) ? target : null
    const rect = anchor?.getBoundingClientRect()
    publish({
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
      data-collab-cursors={surface}
      className={cn('relative', className)}
      onPointerMove={move}
      onPointerLeave={event => {
        if (
          event.target instanceof Element &&
          event.target.closest('[data-collab-cursors]') === event.currentTarget
        )
          publish(null)
      }}
    >
      {children}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        {[...byConnection].map(([connectionId, { id, point }]) => (
          <RemoteCursor key={connectionId} root={root} point={point} id={id} />
        ))}
      </div>
    </div>
  )
}

type RemoteCursorProps = {
  root: RefObject<HTMLDivElement | null>
  point: PointerPosition
  id: string
}
// Semantic anchors follow their own data through scrolling and reordering.
// A cursor on a different record's modal has no matching anchor and stays hidden.
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
    const changes = new MutationObserver(position)
    changes.observe(element, { childList: true, subtree: true })
    element.addEventListener('scroll', position, true)
    window.addEventListener('resize', position)
    return () => {
      observer.disconnect()
      changes.disconnect()
      element.removeEventListener('scroll', position, true)
      window.removeEventListener('resize', position)
    }
  }, [root, point])
  return <Cursor ref={marker} id={id} />
}

const PresenceGroupContext = createContext(false)
export type PresenceGroupProps = { children: ReactNode }
export function PresenceGroup({ children }: PresenceGroupProps) {
  const id = useId()
  return (
    <MotionConfig reducedMotion="user">
      <LayoutGroup id={id}>
        <PresenceGroupContext value={true}>{children}</PresenceGroupContext>
      </LayoutGroup>
    </MotionConfig>
  )
}

function useTargetPresence(target: string) {
  const root = useRef<HTMLDivElement>(null)
  const channel = presenceChannels.field(target)
  const others = usePresenceChannel<boolean>(channel)
  const publish = usePresencePublisher<boolean>(channel, false, hasPresence)
  const ownsFocus = (element: EventTarget | null, owner: HTMLDivElement | null) =>
    owner !== null &&
    element instanceof Element &&
    element.closest('[data-presence-target]') === owner
  useLayoutEffect(() => {
    publish(ownsFocus(document.activeElement, root.current))
  }, [target, publish])
  const users = new Map<string, { id: string; connectionId: string }>()
  for (const entry of others) {
    if (entry.value === true && !users.has(entry.userId)) {
      users.set(entry.userId, { id: entry.userId, connectionId: entry.connectionId })
    }
  }
  return {
    users: [...users.values()],
    props: {
      ref: root,
      'data-collab-target': target,
      'data-presence-target': target,
      onFocusCapture: (event: FocusEvent<HTMLDivElement>) =>
        publish(ownsFocus(event.target, event.currentTarget)),
      onBlurCapture: (event: FocusEvent<HTMLDivElement>) =>
        publish(ownsFocus(event.relatedTarget, event.currentTarget))
    }
  }
}

export type PresenceFrameProps = { target: string; children: ReactNode; className?: string }
export function PresenceFrame({ target, children, className }: PresenceFrameProps) {
  const presence = useTargetPresence(target)
  return (
    <PresenceFramePrimitive
      {...presence.props}
      ids={presence.users.map(user => user.id)}
      icon={<IconCursorText size={12} stroke={1.75} />}
      className={className}
    >
      {children}
    </PresenceFramePrimitive>
  )
}

export type PresenceGutterProps = { target: string; children: ReactNode; className?: string }
export function PresenceGutter({ target, children, className }: PresenceGutterProps) {
  const presence = useTargetPresence(target)
  const grouped = useContext(PresenceGroupContext)
  return (
    <PresenceGutterPrimitive
      {...presence.props}
      users={presence.users}
      animate={grouped}
      className={className}
    >
      {children}
    </PresenceGutterPrimitive>
  )
}

export type SelectionProps = {
  target: string
  selected: boolean
  children: ReactNode
  className?: string
}
export function Selection({ target, selected, children, className }: SelectionProps) {
  const channel = presenceChannels.selection(target)
  usePublishPresenceChannel(channel, selected, hasPresence)
  const others = usePresenceChannel<boolean>(channel)
  const ids = [...new Set(others.filter(other => other.value === true).map(other => other.userId))]
  return (
    <PresenceFramePrimitive
      data-collab-target={target}
      ids={ids}
      icon={<IconPointer size={12} stroke={1.75} />}
      className={className}
    >
      {children}
    </PresenceFramePrimitive>
  )
}
