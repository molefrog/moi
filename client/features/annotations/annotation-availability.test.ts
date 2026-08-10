import { expect, test } from 'bun:test'

import { canAnnotateWorkspaceContent } from './annotation-availability'

test('only built views and idle widgets can be annotated', () => {
  expect(canAnnotateWorkspaceContent('widgets', 'idle', false)).toBe(true)
  expect(canAnnotateWorkspaceContent('view:roadmap', 'idle', true)).toBe(true)
  expect(canAnnotateWorkspaceContent('view:missing', 'idle', false)).toBe(false)
  expect(canAnnotateWorkspaceContent('agent', 'idle', false)).toBe(false)
  expect(canAnnotateWorkspaceContent('scratchpad', 'idle', false)).toBe(false)
  expect(canAnnotateWorkspaceContent('view-builder:draft', 'idle', false)).toBe(false)
  expect(canAnnotateWorkspaceContent('widgets', 'editing', false)).toBe(false)
  expect(canAnnotateWorkspaceContent('widgets', 'customizing', false)).toBe(false)
  expect(canAnnotateWorkspaceContent('view:roadmap', 'customizing', true)).toBe(false)
})
