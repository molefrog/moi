import { expect, test } from 'bun:test'
import { Fragment } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { FocusAvatars } from './focus-avatars'
import { presenceTarget } from '../presence-target'
import { createFocusRoom, namelessUsers, renderCollab } from '../testing/component-fixtures'

test('focus-avatars resolves a usable label for nameless user', () => {
  const [profile, label] = namelessUsers[0]!
  const engine = createFocusRoom(presenceTarget('task:42:title'), profile)
  const html = renderCollab(
    engine,
    <FocusAvatars id="task:42:title">
      <input />
    </FocusAvatars>
  )
  expect(html).toContain(`aria-label="${label}"`)
})

test('focus-avatars matches the semantic target and rejects a different record', () => {
  const backend = createFocusRoom()
  expect(
    renderCollab(
      backend,
      <FocusAvatars id="task:42:title">
        <input />
      </FocusAvatars>
    )
  ).toContain('Ada')
  expect(
    renderCollab(
      backend,
      <FocusAvatars id="task:43:title">
        <input />
      </FocusAvatars>
    )
  ).not.toContain('Ada')
})

test('focus-avatars retains content outside a collaboration provider', () => {
  const html = renderToStaticMarkup(
    <FocusAvatars id="task:42:title">
      <span>Local content</span>
    </FocusAvatars>
  )
  expect(html).toContain('Local content')
})

test('focus-avatars requires one direct element and rejects fragments', () => {
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
        <FocusAvatars id="title">{children as ReactElement}</FocusAvatars>
      )
    ).toThrow('exactly one child element')
  }
  expect(
    renderCollab(
      createFocusRoom(),
      <FocusAvatars id="title">
        <label>
          Title
          <input />
        </label>
      </FocusAvatars>
    )
  ).toContain('Title')
})

test('focus-avatars rejects blank IDs', () => {
  for (const id of ['', '   ']) {
    expect(() =>
      renderCollab(
        createFocusRoom(),
        <FocusAvatars id={id}>
          <input />
        </FocusAvatars>
      )
    ).toThrow('nonempty id')
  }
})
