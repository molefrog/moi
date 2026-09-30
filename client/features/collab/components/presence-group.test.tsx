import { expect, test } from 'bun:test'
import { PresenceGroup } from './presence-group'
import { PresenceFrame } from './presence-frame'
import { PresenceGutter } from './presence-gutter'
import { presenceTarget } from '../presence-target'
import { createFocusRoom, renderCollab } from '../testing/component-fixtures'

test('grouped wrappers keep remote focus attached to semantic IDs through reorder and removal', () => {
  for (const Wrapper of [PresenceFrame, PresenceGutter]) {
    const backend = createFocusRoom(presenceTarget('task:42', 'title'))
    const title = (
      <Wrapper key="title" id="title">
        <input aria-label="Title" />
      </Wrapper>
    )
    const notes = (
      <Wrapper key="notes" id="notes">
        <textarea aria-label="Notes" />
      </Wrapper>
    )
    const original = renderCollab(
      backend,
      <PresenceGroup id="task:42">{[title, notes]}</PresenceGroup>
    )
    const children = original.split('data-presence-target=')
    expect(children).toHaveLength(3)
    expect(children[1]).toStartWith('"task%3A42/title"')
    expect(children[1]).toContain('Ada')
    expect(children[2]).toStartWith('"task%3A42/notes"')
    expect(children[2]).not.toContain('Ada')

    const reordered = renderCollab(
      backend,
      <PresenceGroup id="task:42">{[notes, title]}</PresenceGroup>
    ).split('data-presence-target=')
    expect(reordered[1]).toStartWith('"task%3A42/notes"')
    expect(reordered[1]).not.toContain('Ada')
    expect(reordered[2]).toStartWith('"task%3A42/title"')
    expect(reordered[2]).toContain('Ada')

    expect(
      renderCollab(backend, <PresenceGroup id="task:42">{notes}</PresenceGroup>)
    ).not.toContain('Ada')
    expect(
      renderCollab(backend, <PresenceGroup id="task:43">{title}</PresenceGroup>)
    ).not.toContain('Ada')
  }
})

test('nested groups scope composed children and keep sibling groups independent', () => {
  function Address() {
    return (
      <div>
        <input aria-label="Street" />
        <input aria-label="City" />
      </div>
    )
  }
  const html = renderCollab(
    createFocusRoom(presenceTarget('users', 'user:42', 'address')),
    <PresenceGroup id="users">
      <div className="grid gap-4">
        <PresenceGroup id="user:42">
          <PresenceGutter id="address">
            <Address />
          </PresenceGutter>
        </PresenceGroup>
        <PresenceGroup id="user:43">
          <PresenceGutter id="address">
            <Address />
          </PresenceGutter>
        </PresenceGroup>
      </div>
    </PresenceGroup>
  )
  expect(html).toContain('class="grid gap-4"')
  const children = html.split('data-presence-target=')
  expect(children).toHaveLength(3)
  expect(children[1]).toStartWith('"users/user%3A42/address"')
  expect(children[1]).toContain('Ada')
  expect(children[2]).toStartWith('"users/user%3A43/address"')
  expect(children[2]).not.toContain('Ada')
  expect(html).toContain('Street')
  expect(html).toContain('City')
  expect(html).toContain('Ada')
})

test('groups add neither DOM nor presence publications', () => {
  const engine = createFocusRoom()
  let publications = 0
  const observed = {
    ...engine,
    setPresence: () => {
      publications++
    }
  }
  const child = <span>Local content</span>
  expect(
    renderCollab(
      observed,
      <PresenceGroup id="outer">
        <PresenceGroup id="inner">{child}</PresenceGroup>
      </PresenceGroup>
    )
  ).toBe(renderCollab(engine, child))
  expect(publications).toBe(0)
  expect(engine.getSnapshot().connections[0]?.presence).toEqual([])
})

test('path-like IDs stay separate from nested group boundaries in rendered controls', () => {
  const html = renderCollab(
    createFocusRoom(presenceTarget('a/b', 'title')),
    <>
      <PresenceGroup id="a/b">
        <PresenceFrame id="title">
          <input />
        </PresenceFrame>
      </PresenceGroup>
      <PresenceGroup id="a">
        <PresenceGroup id="b">
          <PresenceFrame id="title">
            <input />
          </PresenceFrame>
        </PresenceGroup>
      </PresenceGroup>
      <PresenceGroup id="a%2Fb">
        <PresenceFrame id="title">
          <input />
        </PresenceFrame>
      </PresenceGroup>
    </>
  )
  const targets = html.split('data-presence-target=')
  expect(targets[1]).toStartWith('"a%2Fb/title"')
  expect(targets[1]).toContain('Ada')
  expect(targets[2]).toStartWith('"a/b/title"')
  expect(targets[2]).not.toContain('Ada')
  expect(targets[3]).toStartWith('"a%252Fb/title"')
  expect(targets[3]).not.toContain('Ada')
})

test('groups reject blank IDs even without any control', () => {
  for (const id of ['', '   ']) {
    expect(() =>
      renderCollab(
        createFocusRoom(),
        <PresenceGroup id={id}>
          <span>Content</span>
        </PresenceGroup>
      )
    ).toThrow('nonempty id')
  }
})
