import type { JsonValue } from 'moi'
import { Fragment, createContext, isValidElement, useContext, useLayoutEffect, useRef } from 'react'
import type { FocusEvent, ReactElement, ReactNode } from 'react'
import { presenceChannels, usePresenceChannel, usePresencePublisher } from '../hooks'
import { presenceTarget } from '../presence-target'

export const hasPresence = (value: JsonValue) => value !== false && value !== null

export const PresenceGroupContext = createContext<readonly string[]>([])

export function usePresenceTarget(id: string): string {
  return presenceTarget(...useContext(PresenceGroupContext), id)
}

export function presenceChild(children: ReactNode): ReactElement {
  if (!isValidElement(children) || children.type === Fragment) {
    throw new Error(
      'PresenceFrame and PresenceGutter require exactly one child element. ' +
        'Wrap a list with PresenceGroup and give each item its own wrapper; fragments are not supported.'
    )
  }
  return children
}

export function useTargetPresence(target: string) {
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
