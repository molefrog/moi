import { expect, test } from 'bun:test'
import { Fragment } from 'react'

import { presenceChildren, presenceChildTarget } from './presence-children'

test('child targets use semantic keys and survive reorder or removal', () => {
  const title = <input key="title" />
  const notes = <textarea key="notes" />
  expect(presenceChildren('task:42', [title, notes])).toEqual([
    { key: 'title', target: 'task:42/title', child: title },
    { key: 'notes', target: 'task:42/notes', child: notes }
  ])
  expect(presenceChildren('task:42', [notes, title]).map(item => item.target)).toEqual([
    'task:42/notes',
    'task:42/title'
  ])
  expect(presenceChildren('task:42', [notes])[0]?.target).toBe('task:42/notes')
  expect(presenceChildren('task:43', [notes])[0]?.target).toBe('task:43/notes')
})

test('one child, keyed fragments, and nested arrays preserve explicit identities', () => {
  const child = (
    <Fragment key="address">
      <input />
      <input />
    </Fragment>
  )
  expect(presenceChildren('person', child)).toEqual([
    { key: 'address', target: 'person/address', child }
  ])
  expect(presenceChildren('person', [null, false, undefined, '', true, [child]])).toEqual(
    presenceChildren('person', child)
  )
})

test('key encoding keeps path-like and escaped keys distinct', () => {
  expect(presenceChildTarget('tasks', 'a/b')).toBe('tasks/a%2Fb')
  expect(presenceChildTarget('tasks', 'a%2Fb')).toBe('tasks/a%252Fb')
  expect(presenceChildren('tasks', [<input key={42} />])[0]?.target).toBe('tasks/42')
})

test('each mode rejects implicit, empty, and duplicate keys with actionable errors', () => {
  const unkeyed = <input />
  const unkeyedFragment = (
    <>
      <input />
    </>
  )
  for (const child of [unkeyed, <input key="" />, 'title', 0, unkeyedFragment]) {
    expect(() => presenceChildren('task', child)).toThrow('explicit, stable key')
  }
  expect(() => presenceChildren('task', [<input key="title" />, [<input key="title" />]])).toThrow(
    'duplicate key "title"'
  )
})
