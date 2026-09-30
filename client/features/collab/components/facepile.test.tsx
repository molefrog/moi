import { expect, test } from 'bun:test'
import { Facepile } from './facepile'
import { createRoom, renderCollab } from '../testing/component-fixtures'

test('facepiles deduplicate user IDs and count the remaining users in overflow', () => {
  const html = renderCollab(
    createRoom(),
    <Facepile ids={['peer', 'peer', 'me', 'missing']} max={1} />
  )
  expect(html).toContain('aria-label="3 users"')
  expect(html.match(/data-slot="avatar"/g)).toHaveLength(2)
  expect(html).toContain('aria-label="Ada"')
  expect(html).toContain('title="2 more"')
  expect(html).toContain('+2')
  expect(html).not.toContain('Unknown user')
})
