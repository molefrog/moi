import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import type { UserProfile } from '@/lib/collab/types'

import { Cursors } from './cursors'
import { presenceChannels } from '../hooks'
import { createRoom, namelessUsers, renderCollab } from '../testing/component-fixtures'

test.each(namelessUsers)(
  'remote cursors resolve a usable label for nameless user %j',
  (profile: UserProfile, label: string) => {
    const engine = createRoom(profile, [
      {
        registrationId: 'cursor',
        appletId: 'views/board',
        channel: presenceChannels.cursor('board'),
        value: { x: 10, y: 20 }
      }
    ])
    expect(renderCollab(engine, <Cursors id="board">Board</Cursors>)).toContain(`>${label}<`)
  }
)

test('cursors retain content outside a collaboration provider', () => {
  const html = renderToStaticMarkup(<Cursors>Local content</Cursors>)
  expect(html).toContain('Local content')
  expect(html).not.toContain('data-slot="avatar"')
})
