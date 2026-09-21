import { useCallback, useLayoutEffect, useMemo, useRef } from 'react'
import type { HTMLAttributes, ReactNode, Ref } from 'react'

import { IconUser } from '@tabler/icons-react'
import { wcagLuminance } from 'culori'

import { cn } from '@/client/lib/cn'
import { Avatar, AvatarBadge, AvatarFallback, AvatarImage } from '@/ui-components/avatar'
import { Badge } from '@/ui-components/badge'

import { facehashDataUrl } from './facehash-avatar'
import { usePeople, usePerson } from './hooks'

// Person components. A person is always an id (`id`, or `ids` for several),
// which resolves to the current name, face, and status through the workspace.

export type PersonSize = 'xs' | 'sm' | 'md' | 'lg'
const AVATAR_SIZE = { xs: 'xs', sm: 'sm', md: 'default', lg: 'lg' } as const
// Shown for an id nobody in this workspace has ever used.
const UNKNOWN_NAME = 'Unknown person'

// Black or white, whichever reads on the person's color.
export function readableOn(color: string): string {
  return (wcagLuminance(color) ?? 0) > 0.3 ? 'oklch(0 0 0)' : 'oklch(1 0 0)'
}

// Identity colors are data. They land on the node as custom properties
// instead of stylesheet rules; classes read `--collab-color` and
// `--collab-contrast` from there. An unknown person gets quiet theme tones.
export function usePersonColor(color: string | undefined) {
  return useCallback(
    (node: HTMLElement | null) => {
      if (!node) return
      node.style.setProperty('--collab-color', color ?? 'var(--muted-foreground)')
      node.style.setProperty('--collab-contrast', color ? readableOn(color) : 'var(--background)')
    },
    [color]
  )
}

export type PersonProps = {
  id: string
  size?: PersonSize
  // Only the face, for stacks, gutters, and tight rows.
  avatarOnly?: boolean
  you?: boolean
  // A quiet second line: where they are, what they are doing. The compact
  // `xs` size keeps it on the same line.
  detail?: ReactNode
  // The green dot: this person has the workspace open in a visible tab right
  // now. Away (every tab hidden) and offline people never get one.
  showStatus?: boolean
  label?: string
  className?: string
}
export function Person({
  id,
  size = 'md',
  avatarOnly = false,
  you = false,
  detail,
  showStatus = true,
  label,
  className
}: PersonProps) {
  const resolved = usePerson(id)
  const identity = resolved.identity
  const name = identity?.name ?? UNKNOWN_NAME
  // A profile without a picture gets the same generated face on every client,
  // so nobody shows up as bare initials.
  const picture = identity?.avatar
  const faceName = identity?.name
  const faceColor = identity?.color
  const face = useMemo(
    () => (faceName && faceColor ? (picture ?? facehashDataUrl(faceName, faceColor)) : undefined),
    [picture, faceName, faceColor]
  )
  const compact = size === 'xs'
  const avatar = (
    <Avatar
      size={AVATAR_SIZE[size]}
      title={label ?? name}
      aria-label={label ?? name}
      className={avatarOnly ? className : undefined}
    >
      {face && <AvatarImage src={face} alt="" />}
      <AvatarFallback>
        {identity ? (
          identity.name.trim().slice(0, 2).toUpperCase()
        ) : (
          <IconUser size={size === 'xs' || size === 'sm' ? 12 : 16} stroke={1.75} />
        )}
      </AvatarFallback>
      {showStatus && resolved.status === 'active' && <AvatarBadge className="bg-success" />}
    </Avatar>
  )
  if (avatarOnly) return avatar
  return (
    <span
      className={cn(
        'inline-flex min-w-0 items-center',
        size === 'lg' ? 'gap-3' : compact ? 'gap-1.5' : 'gap-2',
        className
      )}
    >
      {avatar}
      <span className={cn('flex min-w-0', compact ? 'items-baseline gap-1' : 'flex-col')}>
        <span
          className={cn(
            'truncate text-sm',
            size === 'lg' && 'font-medium',
            !identity && 'text-muted-foreground'
          )}
        >
          {name}
          {you && <span className="font-normal text-muted-foreground"> (you)</span>}
        </span>
        {detail && (
          <span className="truncate text-xs text-muted-foreground">
            {compact && <span aria-hidden="true">· </span>}
            {detail}
          </span>
        )}
      </span>
    </span>
  )
}

export type FacepileProps = {
  ids: readonly string[]
  max?: number
  size?: 'xs' | 'sm' | 'md'
  // Dots are off in a pile, where they crowd the overlapping faces.
  showStatus?: boolean
  className?: string
}
export function Facepile({
  ids,
  max = 3,
  size = 'sm',
  showStatus = false,
  className
}: FacepileProps) {
  const unique = [...new Set(ids)]
  const shown = unique.slice(0, max)
  const hidden = unique.length - shown.length
  return (
    <span
      className={cn(
        'inline-flex items-center',
        size === 'xs' ? '-space-x-1.5' : '-space-x-2',
        className
      )}
      aria-label={`${unique.length} people`}
    >
      {shown.map(id => (
        <Person
          key={id}
          id={id}
          avatarOnly
          size={size}
          showStatus={showStatus}
          className="ring-2 ring-background"
        />
      ))}
      {hidden > 0 && (
        <Avatar
          size={AVATAR_SIZE[size]}
          className="ring-2 ring-background"
          title={`${hidden} more`}
        >
          <AvatarFallback>+{hidden}</AvatarFallback>
        </Avatar>
      )}
    </span>
  )
}

type PersonTagProps = {
  name: string
  color: string | undefined
  icon?: ReactNode
  className?: string
}
// The kit's badge in the person's color, wherever a name marks a place.
function PersonTag({ name, color, icon, className }: PersonTagProps) {
  return (
    <Badge
      ref={usePersonColor(color)}
      className={cn('bg-(--collab-color) text-(--collab-contrast)', className)}
    >
      {icon}
      <span className="truncate">{name}</span>
    </Badge>
  )
}

export type CursorProps = {
  id: string
  // Pointer tip in the parent's coordinate space. Leave both out to place the
  // node yourself through `ref`.
  x?: number
  y?: number
  label?: boolean
  className?: string
  ref?: Ref<HTMLSpanElement>
}
export function Cursor({ id, x, y, label = true, className, ref }: CursorProps) {
  const { identity } = usePerson(id)
  const node = useRef<HTMLSpanElement | null>(null)
  const setColor = usePersonColor(identity?.color)
  const attach = useCallback(
    (element: HTMLSpanElement | null) => {
      node.current = element
      setColor(element)
      if (typeof ref === 'function') ref(element)
      else if (ref) ref.current = element
    },
    [ref, setColor]
  )
  useLayoutEffect(() => {
    if (node.current && x !== undefined && y !== undefined)
      node.current.style.transform = `translate(${x}px, ${y}px)`
  }, [x, y])
  return (
    <span
      ref={attach}
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute top-0 left-0 transition-transform duration-100 ease-linear motion-reduce:transition-none',
        className
      )}
    >
      <span className="relative block animate-in duration-200 zoom-in-75 fade-in">
        <svg viewBox="0 0 20 20" className="size-5 drop-shadow-sm" fill="var(--collab-color)">
          <path d="M1 1 17.5 10.5 9.8 12.2 6 19.5Z" />
        </svg>
        {label && (
          <PersonTag
            name={identity?.name ?? 'Someone'}
            color={identity?.color}
            className="absolute top-4 left-3.5"
          />
        )}
      </span>
    </span>
  )
}

export type PresenceFrameProps = HTMLAttributes<HTMLDivElement> & {
  // Everyone at this element; the first person's color draws the frame.
  ids: readonly string[]
  icon?: ReactNode
  children: ReactNode
}
// Wraps anything. With one element inside, the frame hugs that element and
// takes its corner radius, so a field, a card, a button, and a round avatar
// each get a frame of their own shape with no styling from the caller.
export function PresenceFrame({ ids, icon, children, className, ...rest }: PresenceFrameProps) {
  const resolved = usePeople(ids)
  const lead = resolved[0]
  return (
    <div className={cn('relative', className)} {...rest}>
      {children}
      {lead && (
        <FrameOutline
          names={resolved.map(person => person.identity?.name ?? 'Someone').join(', ')}
          color={lead.identity?.color}
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

type FrameOutlineProps = { names: string; color: string | undefined; icon?: ReactNode }
function FrameOutline({ names, color, icon }: FrameOutlineProps) {
  const node = useRef<HTMLDivElement | null>(null)
  const setColor = usePersonColor(color)
  const attach = useCallback(
    (element: HTMLDivElement | null) => {
      node.current = element
      setColor(element)
    },
    [setColor]
  )
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
      ref={attach}
      className="group/frame pointer-events-none absolute inset-0 animate-in rounded-sm outline-2 outline-(--collab-color) duration-150 fade-in data-[shape=rounded]:outline-offset-2 data-[shape=square]:outline-offset-4"
    >
      <PersonTag
        name={names}
        color={color}
        icon={icon}
        className="absolute bottom-full group-data-[shape=rounded]/frame:mb-1.5 group-data-[shape=square]/frame:mb-2 group-data-[tag=end]/frame:right-0 group-data-[tag=end]/frame:max-w-full group-data-[tag=start]/frame:left-0 group-data-[tag=start]/frame:max-w-40"
      />
    </div>
  )
}

export type GutterPerson = { id: string; target: string }
export type PresenceGutterProps = HTMLAttributes<HTMLDivElement> & {
  // Who is at which block. Blocks among the children carry `data-collab-target`.
  people: readonly GutterPerson[]
  children: ReactNode
}
// Reserves a gutter beside the children and floats a small face next to the
// block each person is on. A face glides to the next block instead of
// reappearing there, the way it does in a shared document.
export function PresenceGutter({ people, children, className, ...rest }: PresenceGutterProps) {
  const stacked = new Map<string, number>()
  return (
    <div data-presence-gutter="" className={cn('relative pl-8', className)} {...rest}>
      {children}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-8" aria-hidden="true">
        {people.map(entry => {
          const stack = stacked.get(entry.target) ?? 0
          stacked.set(entry.target, stack + 1)
          return <GutterMark key={entry.id} entry={entry} stack={stack} />
        })}
      </div>
    </div>
  )
}

type GutterMarkProps = { entry: GutterPerson; stack: number }
function GutterMark({ entry, stack }: GutterMarkProps) {
  const node = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const mark = node.current
    // The gutter is already in the DOM here, while a ref on it would not be
    // attached yet on the first render.
    const element = mark?.closest<HTMLElement>('[data-presence-gutter]')
    if (!element || !mark) return
    const place = () => {
      const target = [...element.querySelectorAll<HTMLElement>('[data-collab-target]')].find(
        candidate => candidate.dataset.collabTarget === entry.target
      )
      if (!target) {
        mark.hidden = true
        return
      }
      const bounds = element.getBoundingClientRect()
      const rect = target.getBoundingClientRect()
      // Centered on the block's first line; later people on the same block
      // overlap toward the content like a facepile.
      const y = rect.top - bounds.top + Math.max(0, (Math.min(rect.height, 24) - 20) / 2)
      mark.hidden = false
      mark.style.transform = `translate(${stack * 8}px, ${y}px)`
    }
    place()
    const observer = new ResizeObserver(place)
    observer.observe(element)
    element.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      observer.disconnect()
      element.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [entry.target, stack])
  return (
    <span
      ref={node}
      className="absolute top-0 left-0 transition-transform duration-300 ease-out motion-reduce:transition-none"
    >
      <Person
        id={entry.id}
        avatarOnly
        size="xs"
        showStatus={false}
        className="animate-in ring-2 ring-background duration-200 zoom-in-75 fade-in"
      />
    </span>
  )
}
