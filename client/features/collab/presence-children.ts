import { Children, isValidElement } from 'react'
import type { ReactElement, ReactNode } from 'react'

export function presenceChildTarget(scope: string, key: string): string {
  return `${scope}/${encodeURIComponent(key)}`
}

type PresenceChild = { key: string; target: string; child: ReactElement }

export function presenceChildren(scope: string, children: ReactNode): PresenceChild[] {
  const items: PresenceChild[] = []
  const keys = new Set<string>()
  // Unlike Children.toArray, forEach preserves the supplied key instead of
  // inventing positional keys for children which have none.
  Children.forEach(children, child => {
    if (child === null || child === '') return
    if (!isValidElement(child) || child.key === null || child.key === '') {
      throw new Error(
        'PresenceFrame/PresenceGutter with each requires an explicit, stable key on every child. ' +
          'Use a field name or record ID, for example <Input key="title" />; do not use array indexes.'
      )
    }
    const key = String(child.key)
    if (keys.has(key)) {
      throw new Error(
        `PresenceFrame/PresenceGutter with each received duplicate key ${JSON.stringify(key)}. ` +
          'Give every child a unique field name or record ID.'
      )
    }
    keys.add(key)
    items.push({ key, target: presenceChildTarget(scope, key), child })
  })
  return items
}
