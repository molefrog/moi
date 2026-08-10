import { expect, test } from 'bun:test'

import { canAnnotateWorkspaceContent } from './annotation-availability'

test('only built views and idle widgets can be annotated', () => {
  expect(canAnnotateWorkspaceContent('widgets', true, false)).toBe(true)
  expect(canAnnotateWorkspaceContent('view:roadmap', true, true)).toBe(true)
  expect(canAnnotateWorkspaceContent('view:missing', true, false)).toBe(false)
  expect(canAnnotateWorkspaceContent('agent', true, false)).toBe(false)
  expect(canAnnotateWorkspaceContent('scratchpad', true, false)).toBe(false)
  expect(canAnnotateWorkspaceContent('view-builder:draft', true, false)).toBe(false)
  expect(canAnnotateWorkspaceContent('widgets', false, false)).toBe(false)
  expect(canAnnotateWorkspaceContent('view:roadmap', false, true)).toBe(false)
})
