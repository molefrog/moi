import { expect, test } from 'bun:test'
import { Fragment } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { PresenceGutter } from './presence-gutter'
import { presenceTarget } from '../presence-target'
import { createFocusRoom, namelessUsers, renderCollab } from '../testing/component-fixtures'

test('presence-gutter resolves a usable label for nameless user', () => {
  const [profile, label] = namelessUsers[0]!
  const engine = createFocusRoom(presenceTarget('task:42:title'), profile)
  const html = renderCollab(
    engine,
    <PresenceGutter id="task:42:title">
      <input />
    </PresenceGutter>
  )
  expect(html).toContain(`aria-label="${label}"`)
})

test('presence-gutter matches the semantic target and rejects a different record', () => {
  const backend = createFocusRoom()
  expect(
    renderCollab(
      backend,
      <PresenceGutter id="task:42:title">
        <input />
      </PresenceGutter>
    )
  ).toContain('Ada')
  expect(
    renderCollab(
      backend,
      <PresenceGutter id="task:43:title">
        <input />
      </PresenceGutter>
    )
  ).not.toContain('Ada')
})

test('presence-gutter retains content outside a collaboration provider', () => {
  const html = renderToStaticMarkup(
    <PresenceGutter id="task:42:title">
      <span>Local content</span>
    </PresenceGutter>
  )
  expect(html).toContain('Local content')
})

test('presence-gutter requires one direct element and rejects fragments', () => {
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
        <PresenceGutter id="title">{children as ReactElement}</PresenceGutter>
      )
    ).toThrow('exactly one child element')
  }
  expect(
    renderCollab(
      createFocusRoom(),
      <PresenceGutter id="title">
        <label>
          Title
          <input />
        </label>
      </PresenceGutter>
    )
  ).toContain('Title')
})

test('presence-gutter rejects blank IDs', () => {
  for (const id of ['', '   ']) {
    expect(() =>
      renderCollab(
        createFocusRoom(),
        <PresenceGutter id={id}>
          <input />
        </PresenceGutter>
      )
    ).toThrow('nonempty id')
  }
})
