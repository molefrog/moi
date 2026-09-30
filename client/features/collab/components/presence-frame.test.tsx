import { expect, test } from 'bun:test'
import { Fragment } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { UserProfile } from '@/lib/collab/types'
import { PresenceFrame, PresenceFramePrimitive } from './presence-frame'
import { PresenceGutter } from './presence-gutter'
import { presenceTarget } from '../presence-target'
import { createFocusRoom, me, namelessUsers, renderCollab } from '../testing/component-fixtures'

test('presence frames skip missing users and hide the outline when no users resolve', () => {
  const backend = createFocusRoom()
  const frame = renderCollab(
    backend,
    <PresenceFramePrimitive ids={['missing', 'peer']}>
      <input />
    </PresenceFramePrimitive>
  )
  expect(frame).toContain('Ada')
  expect(frame).toContain('outline-collab')
  backend.setUsers([me])
  const removed = renderCollab(
    backend,
    <PresenceFramePrimitive ids={['missing', 'peer']}>
      <input />
    </PresenceFramePrimitive>
  )
  expect(removed).toContain('<input')
  expect(removed).not.toContain('outline-collab')
})

test('inactive applets retain content and hide remote focus', () => {
  const html = renderCollab(
    createFocusRoom(),
    <PresenceFrame id="task:42:title">
      <input aria-label="Title" />
    </PresenceFrame>,
    false
  )
  expect(html).toContain('Title')
  expect(html).not.toContain('Ada')
})

test.each(namelessUsers)(
  'presence-frame resolves a usable label for nameless user %j',
  (profile: UserProfile, label: string) => {
    const engine = createFocusRoom(presenceTarget('task:42:title'), profile)
    const html = renderCollab(
      engine,
      <PresenceFrame id="task:42:title">
        <input />
      </PresenceFrame>
    )
    expect(html).toContain(`>${label}<`)
  }
)

test('presence-frame matches the semantic target and rejects a different record', () => {
  const backend = createFocusRoom()
  expect(
    renderCollab(
      backend,
      <PresenceFrame id="task:42:title">
        <input />
      </PresenceFrame>
    )
  ).toContain('Ada')
  expect(
    renderCollab(
      backend,
      <PresenceFrame id="task:43:title">
        <input />
      </PresenceFrame>
    )
  ).not.toContain('Ada')
})

test('presence-frame retains content outside a collaboration provider', () => {
  const html = renderToStaticMarkup(
    <PresenceFrame id="task:42:title">
      <PresenceGutter id="task:42:notes">
        <span>Local content</span>
      </PresenceGutter>
    </PresenceFrame>
  )
  expect(html).toContain('Local content')
  expect(html).not.toContain('data-slot="avatar"')
})

test('presence-frame requires one direct element and rejects fragments', () => {
  const invalidChildren: ReactNode[] = [
    null,
    false,
    '',
    'Title',
    0,
    undefined,
    [<input key="title" />],
    [<input key="title" />, <input key="notes" />],
    <Fragment key="one">
      <input />
    </Fragment>,
    <Fragment key="multiple">
      <input />
      <input />
    </Fragment>
  ]
  for (const children of invalidChildren) {
    // JavaScript applets can pass child shapes rejected by the TypeScript declaration.
    expect(() =>
      renderCollab(
        createFocusRoom(),
        <PresenceFrame id="title">{children as ReactElement}</PresenceFrame>
      )
    ).toThrow('exactly one child element')
  }
  expect(
    renderCollab(
      createFocusRoom(),
      <PresenceFrame id="title">
        <label>
          Title
          <input />
        </label>
      </PresenceFrame>
    )
  ).toContain('Title')
})

test('presence-frame rejects blank IDs', () => {
  for (const id of ['', '   ']) {
    expect(() =>
      renderCollab(
        createFocusRoom(),
        <PresenceFrame id={id}>
          <input />
        </PresenceFrame>
      )
    ).toThrow('nonempty id')
  }
})
