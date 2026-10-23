import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'bun:test'
import { UserAvatarGroup, UserAvatarGroupContainer } from './user-avatar-group'
import { createRoom, renderCollab } from '../testing/component-fixtures'

test('avatar groups deduplicate user IDs and count the remaining users in overflow', () => {
  const html = renderCollab(
    createRoom(),
    <UserAvatarGroupContainer ids={['peer', 'peer', 'me', 'missing']} max={1} />
  )
  expect(html).toContain('aria-label="3 users"')
  expect(html.match(/aria-label="Ada"/g)).toHaveLength(1)
  expect(html).toContain('+2')
  expect(html).not.toContain('Unknown user')
})

test('avatar groups render supplied profiles and overflow without a collaboration provider', () => {
  const html = renderToStaticMarkup(
    <UserAvatarGroup users={[{ id: 'ada', name: 'Ada', color: 'cyan' }, undefined]} max={1} />
  )
  expect(html).toContain('aria-label="Ada"')
  expect(html).toContain('aria-label="2 users"')
  expect(html).toContain('+1')
})
