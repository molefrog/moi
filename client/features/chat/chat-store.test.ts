import { afterEach, expect, test } from 'bun:test'
import { liveStore } from './chat-store'

const initial = liveStore.getInitialState()
afterEach(() => liveStore.setState(initial, true))

test('renaming an absent session does not notify subscribers', () => {
  const before = liveStore.getState()
  let updates = 0
  const unsubscribe = liveStore.subscribe(() => updates++)
  try {
    for (let i = 0; i < 100; i++) {
      liveStore.getState().renameSession('workspace', 'draft:views/old', 'draft:views/new')
    }
    expect(liveStore.getState()).toBe(before)
    expect(updates).toBe(0)
  } finally {
    unsubscribe()
  }
})

test('repeating a completed rename is a no-op', () => {
  liveStore.getState().setActivity('workspace', 'old', 'running')
  liveStore.getState().setError('workspace', 'old', 'Test error')
  liveStore.getState().renameSession('workspace', 'old', 'new')
  const renamed = liveStore.getState()
  expect(renamed.activity['workspace:new']).toBe('running')
  expect(renamed.errors['workspace:new']).toBe('Test error')
  liveStore.getState().renameSession('workspace', 'old', 'new')
  expect(liveStore.getState()).toBe(renamed)
})

test('renaming to the same id preserves session state', () => {
  liveStore.getState().setActivity('workspace', 'same', 'running')
  const before = liveStore.getState()
  liveStore.getState().renameSession('workspace', 'same', 'same')
  expect(liveStore.getState()).toBe(before)
})
