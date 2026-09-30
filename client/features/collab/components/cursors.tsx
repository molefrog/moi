import type { CursorsProps } from 'moi/collab'
import type { JsonValue } from 'moi'
import { useCallback, useLayoutEffect, useRef } from 'react'
import type { PointerEvent, Ref, RefObject } from 'react'

import { cn } from '@/client/lib/cn'

import { presenceChannels, usePresenceChannel, usePresencePublisher, useUser } from '../hooks'
import { userDisplayName } from '../users'
import { UserTag } from './user-tag'
import { hasPresence } from './presence-helpers'

export type { CursorsProps } from 'moi/collab'

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
      data-collab-cursors={id}
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
    changes.observe(element, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-collab-target']
    })
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

type CursorProps = {
  id: string
  // Pointer tip in the parent's coordinate space. Leave both out to place the
  // node yourself through `ref`.
  x?: number
  y?: number
  label?: boolean
  className?: string
  ref?: Ref<HTMLSpanElement>
}
function Cursor({ id, x, y, label = true, className, ref }: CursorProps) {
  const user = useUser(id)
  const node = useRef<HTMLSpanElement | null>(null)
  const attach = useCallback(
    (element: HTMLSpanElement | null) => {
      node.current = element
      if (typeof ref === 'function') ref(element)
      else if (ref) ref.current = element
    },
    [ref]
  )
  useLayoutEffect(() => {
    if (node.current && x !== undefined && y !== undefined)
      node.current.style.transform = `translate(${x}px, ${y}px)`
  }, [x, y])
  return (
    <span
      ref={attach}
      aria-hidden="true"
      data-collab-color={user?.color ?? 'unknown'}
      className={cn(
        'pointer-events-none absolute top-0 left-0 transition-transform duration-100 ease-linear motion-reduce:transition-none',
        className
      )}
    >
      <span className="relative block animate-in duration-200 zoom-in-75 fade-in">
        <svg viewBox="0 0 20 20" className="size-5 fill-collab drop-shadow-sm">
          <path d="M1 1 17.5 10.5 9.8 12.2 6 19.5Z" />
        </svg>
        {label && (
          <UserTag
            name={user ? userDisplayName(user) : 'Someone'}
            color={user?.color}
            className="absolute top-4 left-3.5"
          />
        )}
      </span>
    </span>
  )
}
