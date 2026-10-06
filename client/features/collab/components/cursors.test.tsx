import { expect, test } from 'bun:test'
import type { JsonValue } from 'moi'
import { renderToStaticMarkup } from 'react-dom/server'

import { Cursors } from './cursors'
import { presenceChannels } from '../hooks'
import { createRoom, namelessUsers, renderCollab } from '../testing/component-fixtures'

test('remote cursors resolve a usable label for nameless user', () => {
  const [profile, label] = namelessUsers[0]!
  const engine = createRoom(profile, [
    {
      registrationId: 'cursor',
      appletId: 'views/board',
      channel: presenceChannels.cursor('board'),
      value: { x: 10, y: 20 }
    }
  ])
  expect(renderCollab(engine, <Cursors id="board">Board</Cursors>)).toContain(`>${label}<`)
})

test('cursors retain content outside a collaboration provider', () => {
  const html = renderToStaticMarkup(<Cursors>Local content</Cursors>)
  expect(html).toContain('Local content')
})

test('remote cursors ignore invalid coordinates and presence for another area', () => {
  const cases = [
    [{ x: 10, y: 20 }, 'board', true],
    [{ x: 10, y: 20 }, 'other-area', false],
    [null, 'board', false],
    [{ x: '10', y: 20 }, 'board', false],
    [{ x: Infinity, y: 20 }, 'board', false]
  ] satisfies Array<[JsonValue, string, boolean]>
  for (const [value, area, visible] of cases) {
    const room = createRoom(undefined, [
      {
        registrationId: 'cursor',
        appletId: 'views/board',
        channel: presenceChannels.cursor(area),
        value
      }
    ])
    const html = renderCollab(room, <Cursors id="board">Board</Cursors>)
    expect(html.includes('>Ada<')).toBe(visible)
    expect(html).toContain('Board')
  }
})
