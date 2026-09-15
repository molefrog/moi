import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import type { FocusEvent, PointerEvent, ReactNode, RefObject } from 'react'

import {
  IconCheck,
  IconCloudOff,
  IconCursorText,
  IconPointer,
  IconRefresh
} from '@tabler/icons-react'

import { cn } from '@/client/lib/cn'
import {
  Avatar,
  AvatarBadge,
  AvatarFallback,
  AvatarGroup,
  AvatarImage
} from '@/ui-components/avatar'
import type { CollabIdentity, CollabJsonValue, CollabParticipant } from '@/lib/collab/types'

import { facehashDataUrl } from './facehash-avatar'
import { useConnection, useOthers, usePresenceChannel, useSelf } from './hooks'

export function uniqueParticipants(participants: CollabParticipant[]): CollabParticipant[] {
  return [
    ...new Map(participants.map(participant => [participant.identity.id, participant])).values()
  ]
}

export type ParticipantAvatarProps = {
  identity: CollabIdentity
  size?: 'sm' | 'default' | 'lg'
  // Marks a person whose browser tab is visible right now.
  active?: boolean
  label?: string
  className?: string
}
export function ParticipantAvatar({
  identity,
  size = 'sm',
  active = false,
  label = identity.name,
  className
}: ParticipantAvatarProps) {
  // An identity without a picture gets the same generated face on every
  // client, so nobody shows up as bare initials.
  const face = useMemo(
    () => identity.avatar ?? facehashDataUrl(identity.name, identity.color),
    [identity.avatar, identity.name, identity.color]
  )
  return (
    <Avatar size={size} title={label} aria-label={label} className={className}>
      {face && <AvatarImage src={face} alt="" />}
      <AvatarFallback>{identity.name.trim().slice(0, 2).toUpperCase()}</AvatarFallback>
      {active && <AvatarBadge className="bg-success" />}
    </Avatar>
  )
}

export type ActivityProps = { scope?: 'page' | 'workspace'; className?: string }
export function Activity({ scope = 'page', className }: ActivityProps) {
  const others = useOthers({ scope })
  const self = useSelf()
  const participants = uniqueParticipants(self ? [self, ...others] : others)
  return (
    <AvatarGroup className={className} aria-label={`${participants.length} people online`}>
      {participants.map(participant => (
        <ParticipantAvatar key={participant.identity.id} identity={participant.identity} />
      ))}
    </AvatarGroup>
  )
}

export type SyncStatusProps = { className?: string }
export function SyncStatus({ className }: SyncStatusProps) {
  const state = useConnection()
  const message =
    state.error ??
    (state.status === 'connecting'
      ? 'Connecting…'
      : state.status === 'disconnected'
        ? 'Disconnected'
        : state.pendingCount
          ? 'Saving…'
          : 'Saved')
  const Icon =
    state.error || state.status === 'disconnected'
      ? IconCloudOff
      : state.status === 'connecting' || state.pendingCount
        ? IconRefresh
        : IconCheck
  return (
    <span
      role="status"
      className={cn(
        'inline-flex items-center gap-1.5 text-xs text-muted-foreground',
        state.error && 'text-destructive',
        className
      )}
    >
      <Icon size={12} stroke={1.75} />
      {message}
    </span>
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
  const cursor = usePresenceChannel<CollabJsonValue>(`cursor:${surface}`, null)
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
              identity={participant.identity}
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
  identity: CollabIdentity
}
function RemoteCursor({ root, point, identity }: RemoteCursorProps) {
  const marker = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const element = root.current
    const node = marker.current
    if (!element || !node) return
    // Dynamic identity colors and pointer geometry are data, applied to this
    // overlay's DOM node instead of adding arbitrary applet stylesheet rules.
    node.style.setProperty('--collab-color', identity.color)
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
  }, [root, point, identity.color])
  return (
    <div
      ref={marker}
      className="absolute top-0 left-0 flex items-start gap-1 text-(--collab-color)"
    >
      <IconPointer size={16} stroke={1.75} />
      <span className="mt-3 rounded bg-background px-1.5 py-0.5 text-xs shadow-sm">
        {identity.name}
      </span>
    </div>
  )
}

type PresenceOutlineProps = {
  people: CollabParticipant[]
  children: ReactNode
  target: string
  className?: string
  onFocusCapture?: (event: FocusEvent<HTMLDivElement>) => void
  onBlurCapture?: (event: FocusEvent<HTMLDivElement>) => void
}
function PresenceOutline({
  people,
  children,
  target,
  className,
  onFocusCapture,
  onBlurCapture
}: PresenceOutlineProps) {
  const root = useRef<HTMLDivElement>(null)
  const color = people[0]?.identity.color
  useLayoutEffect(() => {
    if (root.current && color) root.current.style.setProperty('--collab-color', color)
  }, [color])
  return (
    <div
      ref={root}
      data-collab-target={target}
      className={cn('relative', className)}
      onFocusCapture={onFocusCapture}
      onBlurCapture={onBlurCapture}
    >
      {children}
      {people.length > 0 && (
        <div className="pointer-events-none absolute inset-0 rounded-[inherit] outline-2 outline-offset-2 outline-(--collab-color)">
          <span className="absolute right-0 bottom-full mb-1 inline-flex max-w-full items-center gap-1 rounded bg-background px-1.5 py-0.5 text-xs text-(--collab-color) shadow-sm">
            <IconCursorText size={12} stroke={1.75} />
            <span className="truncate">
              {people.map(person => person.identity.name).join(', ')}
            </span>
          </span>
        </div>
      )}
    </div>
  )
}

export type PresenceFieldProps = { target: string; children: ReactNode; className?: string }
export function PresenceField({ target, children, className }: PresenceFieldProps) {
  const presence = usePresenceChannel<boolean>(`field:${target}`, false)
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
  const { setValue, others } = usePresenceChannel<boolean>(`selection:${target}`, selected)
  useEffect(() => setValue(selected), [selected, setValue])
  const people = useMemo(
    () =>
      uniqueParticipants(
        others.filter(other => other.value === true).map(other => other.participant)
      ),
    [others]
  )
  return (
    <PresenceOutline target={target} people={people} className={className}>
      {children}
    </PresenceOutline>
  )
}
