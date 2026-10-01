import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { PresenceAvatars } from './presence-avatars'
import { presenceTarget } from '../presence-target'
import { createFocusRoom, namelessUsers, renderCollab } from '../testing/component-fixtures'

test('presence-avatars resolves a usable label for nameless user', () => {
  const [profile, label] = namelessUsers[0]!
  const engine = createFocusRoom(presenceTarget('task:42:title'), profile)
  const html = renderCollab(
    engine,
    <PresenceAvatars id="task:42:title">
      <input />
    </PresenceAvatars>
  )
  expect(html).toContain(`aria-label="${label}"`)
})

test('presence-avatars matches the semantic target and rejects a different record', () => {
  const backend = createFocusRoom()
  expect(
    renderCollab(
      backend,
      <PresenceAvatars id="task:42:title">
        <input />
      </PresenceAvatars>
    )
  ).toContain('Ada')
  expect(
    renderCollab(
      backend,
      <PresenceAvatars id="task:43:title">
        <input />
      </PresenceAvatars>
    )
  ).not.toContain('Ada')
})

test('presence-avatars retains content outside a collaboration provider', () => {
  const html = renderToStaticMarkup(
    <PresenceAvatars id="task:42:title">
      <span>Local content</span>
    </PresenceAvatars>
  )
  expect(html).toContain('Local content')
})

test('presence-avatars rejects blank IDs', () => {
  for (const id of ['', '   ']) {
    expect(() =>
      renderCollab(
        createFocusRoom(),
        <PresenceAvatars id={id}>
          <input />
        </PresenceAvatars>
      )
    ).toThrow('nonempty id')
  }
})
