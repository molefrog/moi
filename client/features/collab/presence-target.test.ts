import { expect, test } from 'bun:test'

import { presenceTarget } from './presence-target'

test('presence targets compose complete semantic ID segments', () => {
  expect(presenceTarget('tasks', '42', 'title')).toBe('tasks/42/title')
  expect(presenceTarget('task:42', 'title')).toBe('task%3A42/title')
  expect(presenceTarget('task:43', 'title')).not.toBe(presenceTarget('task:42', 'title'))
})

test('path-like and encoded IDs cannot collide with nested groups', () => {
  const targets = [
    presenceTarget('a', 'b', 'title'),
    presenceTarget('a/b', 'title'),
    presenceTarget('a%2Fb', 'title'),
    presenceTarget('a', 'b/title'),
    presenceTarget('a/b/title')
  ]
  expect(new Set(targets).size).toBe(targets.length)
  expect(presenceTarget('a/b', 'title')).toBe('a%2Fb/title')
  expect(presenceTarget('a%2Fb', 'title')).toBe('a%252Fb/title')
  expect(presenceTarget('tasks', '한글 / title')).toBe('tasks/%ED%95%9C%EA%B8%80%20%2F%20title')
})

test('empty and blank ID segments fail instead of sharing an accidental target', () => {
  expect(() => presenceTarget()).toThrow('nonempty id')
  for (const id of ['', ' ', '\t\n']) {
    expect(() => presenceTarget(id)).toThrow('nonempty id')
    expect(() => presenceTarget('tasks', id, 'title')).toThrow('nonempty id')
  }
})
