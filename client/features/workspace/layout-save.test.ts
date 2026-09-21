import { describe, expect, test } from 'bun:test'

import type { WorkspaceTabsState, WorkspaceTheme } from '@/lib/types'
import { createDefaultWorkspaceLayout } from '@/lib/workspace-layout'
import { mergeLayoutForSave } from '@/server/layout'

import { accumulateLayoutSave } from './layout-save'

const initial = createDefaultWorkspaceLayout()
const selected: WorkspaceTabsState = { open: ['overview', 'view:board'], active: 'view:board' }

describe('debounced layout saves', () => {
  test('grid and theme edits omit cached tabs, preserving newer server navigation', () => {
    const update = { widgetGrid: [{ i: 'board', x: 1, y: 2 }] }
    const pending = accumulateLayoutSave({ ...initial, ...update }, update, null)
    const theme: WorkspaceTheme = {
      font: 'sans',
      color: 'rose',
      radius: 'square',
      agent: 'dorito'
    }
    const payload = accumulateLayoutSave({ ...initial, ...update, theme }, { theme }, pending)

    expect('tabs' in payload).toBe(false)
    const saved = mergeLayoutForSave({ ...initial, tabs: selected }, payload)
    expect(saved.tabs).toEqual(selected)
    expect(saved.widgetGrid).toEqual(update.widgetGrid)
    expect(saved.theme).toEqual(theme)
  })

  test('navigation followed by a grid edit keeps both changes in the same save', () => {
    const navigated = { ...initial, tabs: selected }
    const pending = accumulateLayoutSave(navigated, { tabs: selected }, null)
    const update = { widgetGrid: [{ i: 'board', x: 2, y: 3 }] }
    const payload = accumulateLayoutSave({ ...navigated, ...update }, update, pending)

    expect(mergeLayoutForSave(initial, payload)).toEqual({ ...navigated, ...update })
  })

  test('a refetch between navigation and another edit cannot erase pending navigation', () => {
    const pending = accumulateLayoutSave({ ...initial, tabs: selected }, { tabs: selected }, null)
    // The layout query refetched the old server state before the debounce fired.
    const update = { layoutMode: 'fullscreen' as const }
    const payload = accumulateLayoutSave({ ...initial, ...update }, update, pending)

    expect(payload.tabs).toEqual(selected)
    expect(payload.layoutMode).toBe('fullscreen')
  })

  test('the latest explicit navigation replaces the previous pending tab selection', () => {
    const pending = accumulateLayoutSave({ ...initial, tabs: selected }, { tabs: selected }, null)
    const tabs: WorkspaceTabsState = { open: ['overview', 'agent'], active: 'agent' }
    const payload = accumulateLayoutSave({ ...initial, tabs }, { tabs }, pending)

    expect(payload.tabs).toEqual(tabs)
    expect(pending.tabs).toEqual(selected)
  })

  test('a new debounce window does not resend previously saved tabs', () => {
    const saved = { ...initial, tabs: selected }
    const update = { layoutMode: 'fullscreen' as const }
    const payload = accumulateLayoutSave({ ...saved, ...update }, update, null)

    expect('tabs' in payload).toBe(false)
    expect(payload.layoutMode).toBe('fullscreen')
  })
})
