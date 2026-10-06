import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { CollabContext, useCollabEnabled } from './provider'
import { createFakeEngine } from './testing/fake-engine'

const self = { id: 'self', name: 'Self', color: 'emerald' } as const

function CollabEnabled() {
  return <output>{String(useCollabEnabled())}</output>
}

test('collaboration is enabled only with runtime support and a current user', () => {
  for (const [user, enabled, expected] of [
    [undefined, true, false],
    [self, false, false],
    [self, true, true]
  ] as const) {
    const engine = createFakeEngine({ self: user })
    const html = renderToStaticMarkup(
      <CollabContext value={{ ...engine, enabled }}>
        <CollabEnabled />
      </CollabContext>
    )
    expect(html).toBe(`<output>${expected}</output>`)
  }
})
