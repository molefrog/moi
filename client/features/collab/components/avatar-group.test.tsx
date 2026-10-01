import { expect, test } from 'bun:test'
import { AvatarGroup } from './avatar-group'
import { createRoom, renderCollab } from '../testing/component-fixtures'

test('avatar groups deduplicate user IDs and count the remaining users in overflow', () => {
  const html = renderCollab(
    createRoom(),
    <AvatarGroup ids={['peer', 'peer', 'me', 'missing']} max={1} />
  )
  expect(html).toContain('aria-label="3 users"')
  expect(html.match(/aria-label="Ada"/g)).toHaveLength(1)
  expect(html).toContain('+2')
  expect(html).not.toContain('Unknown user')
})

test('avatar groups can show only an overflow count', () => {
  const html = renderCollab(createRoom(), <AvatarGroup ids={['peer', 'me']} max={0} size="xs" />)
  expect(html).toContain('aria-label="2 users"')
  expect(html).toContain('aria-label="2 more"')
  expect(html).toContain('+2')
  expect(html).not.toContain('aria-label="Ada"')
})
