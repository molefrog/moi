import { expect, test } from 'bun:test'
import { Fragment } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { FocusFrame, PresenceOutline } from './focus-frame'
import { FocusAvatars } from './focus-avatars'
import { presenceTarget } from '../presence-target'
import { createFocusRoom, me, namelessUsers, renderCollab } from '../testing/component-fixtures'

test('presence frames skip unresolved users and clear their identity after removal', () => {
  const backend = createFocusRoom()
  const frame = renderCollab(
    backend,
    <PresenceOutline ids={['missing', 'peer']}>
      <input />
    </PresenceOutline>
  )
  expect(frame).toContain('Ada')
  expect(frame).not.toContain('Unknown user')
  backend.setUsers([me])
  const removed = renderCollab(
    backend,
    <PresenceOutline ids={['missing', 'peer']}>
      <input />
    </PresenceOutline>
  )
  expect(removed).toContain('<input')
  expect(removed).not.toContain('Ada')
  expect(removed).not.toContain('Unknown user')
})

test('inactive applets retain content and hide remote focus', () => {
  const html = renderCollab(
    createFocusRoom(),
    <FocusFrame id="task:42:title">
      <input aria-label="Title" />
    </FocusFrame>,
    false
  )
  expect(html).toContain('Title')
  expect(html).not.toContain('Ada')
})

test('focus-frame resolves a usable label for nameless user', () => {
  const [profile, label] = namelessUsers[0]!
  const engine = createFocusRoom(presenceTarget('task:42:title'), profile)
  const html = renderCollab(
    engine,
    <FocusFrame id="task:42:title">
      <input />
    </FocusFrame>
  )
  expect(html).toContain(`>${label}<`)
})

test('focus-frame matches the semantic target and rejects a different record', () => {
  const backend = createFocusRoom()
  expect(
    renderCollab(
      backend,
      <FocusFrame id="task:42:title">
        <input />
      </FocusFrame>
    )
  ).toContain('Ada')
  expect(
    renderCollab(
      backend,
      <FocusFrame id="task:43:title">
        <input />
      </FocusFrame>
    )
  ).not.toContain('Ada')
})

test('focus-frame retains content outside a collaboration provider', () => {
  const html = renderToStaticMarkup(
    <FocusFrame id="task:42:title">
      <FocusAvatars id="task:42:notes">
        <span>Local content</span>
      </FocusAvatars>
    </FocusFrame>
  )
  expect(html).toContain('Local content')
})

test('focus-frame requires one direct element and rejects fragments', () => {
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
        <FocusFrame id="title">{children as ReactElement}</FocusFrame>
      )
    ).toThrow('exactly one child element')
  }
  expect(
    renderCollab(
      createFocusRoom(),
      <FocusFrame id="title">
        <label>
          Title
          <input />
        </label>
      </FocusFrame>
    )
  ).toContain('Title')
})

test('focus-frame rejects blank IDs', () => {
  for (const id of ['', '   ']) {
    expect(() =>
      renderCollab(
        createFocusRoom(),
        <FocusFrame id={id}>
          <input />
        </FocusFrame>
      )
    ).toThrow('nonempty id')
  }
})
