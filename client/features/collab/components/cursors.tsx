import type { CursorsProps } from 'moi/collab'
import type { JsonValue } from 'moi'
import { useLayoutEffect, useRef } from 'react'
import type { PointerEvent, Ref, RefObject } from 'react'
import { IconPointer2 } from '@tabler/icons-react'

import { cn } from '@/client/lib/cn'
import { Badge } from '@/ui-components/badge'

import { presenceChannels, usePresenceChannel, usePresencePublisher, useUser } from '../hooks'
import { userDisplayName } from '../users'
import { hasPresence } from './presence-helpers'

type PointerPosition = { x: number; y: number; target?: string; targetX?: number; targetY?: number }
function pointerPosition(value: JsonValue): PointerPosition | null {
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

export function Cursors({ id = 'default', children, className }: CursorsProps) {
  const root = useRef<HTMLDivElement>(null)
  const layer = useRef<HTMLDivElement>(null)
  // Keep the overlay in the visible viewport when the cursor area itself scrolls.
  useLayoutEffect(() => {
    const element = root.current
    const overlay = layer.current
    if (!element || !overlay) return
    const position = () => {
      overlay.style.transform = `translate(${element.scrollLeft}px, ${element.scrollTop}px)`
    }
    position()
    element.addEventListener('scroll', position)
    return () => element.removeEventListener('scroll', position)
  }, [])
  const channel = presenceChannels.cursor(id)
  const cursors = usePresenceChannel<JsonValue>(channel)
  const publish = usePresencePublisher<JsonValue>(channel, null, hasPresence)
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
      x: event.clientX - bounds.left - element.clientLeft + element.scrollLeft,
      y: event.clientY - bounds.top - element.clientTop + element.scrollTop,
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
      data-collab-cursors={id}
      className={cn('relative', className)}
      onPointerEnter={move}
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
      <div
        ref={layer}
        className="pointer-events-none absolute inset-0 overflow-hidden"
        aria-hidden="true"
      >
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
    const position = (animate = false) => {
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
        x = rect.left - bounds.left - element.clientLeft + rect.width * (point.targetX ?? 0)
        y = rect.top - bounds.top - element.clientTop + rect.height * (point.targetY ?? 0)
      }
      const transform = `translate(${x}px, ${y}px)`
      if (node.hidden || node.style.transform !== transform) {
        // Smooth pointer updates; place new cursors and layout corrections immediately.
        node.dataset.moving = animate && !node.hidden ? 'true' : 'false'
        node.style.transform = transform
      }
      node.hidden = false
    }
    position(true)
    const reposition = () => position()
    const observer = new ResizeObserver(reposition)
    observer.observe(element)
    const changes = new MutationObserver(reposition)
    changes.observe(element, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-collab-target']
    })
    element.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      observer.disconnect()
      changes.disconnect()
      element.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [root, point])
  return <Cursor ref={marker} id={id} />
}

type CursorProps = {
  id: string
  ref?: Ref<HTMLSpanElement>
}
function Cursor({ id, ref }: CursorProps) {
  const user = useUser(id)
  return (
    <span
      ref={ref}
      // Position before revealing it, so the first update cannot animate from (0, 0).
      hidden
      aria-hidden="true"
      data-collab-color={user?.color ?? 'unknown'}
      className="pointer-events-none absolute top-0 left-0 transition-transform duration-100 ease-linear data-[moving=false]:transition-none motion-reduce:transition-none"
    >
      <span className="relative block animate-in duration-200 zoom-in-75 fade-in">
        <IconPointer2
          size={24}
          stroke={1.5}
          className="-translate-x-0.5 -translate-y-0.5 fill-collab stroke-white drop-shadow-xs"
        />
        <Badge className="absolute top-3.5 left-3.5 bg-collab text-collab-foreground">
          <span className="truncate">{user ? userDisplayName(user) : 'Someone'}</span>
        </Badge>
      </span>
    </span>
  )
}
