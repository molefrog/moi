import { describe, expect, test } from 'bun:test'

import type { WorkspaceLayout } from '@/lib/types'

import { mergeLayoutForSave } from '../layout'

// The grid editor and `moi config` write the same `.workspace.json`. A layout
// PUT is authoritative for the editor fields but must NOT touch identity
// (name/icon) — otherwise the client's name-stripped body erases a configured
// name. mergeLayoutForSave enforces that.

const base: WorkspaceLayout = { version: 1, widgetGrid: [], chatMode: 'sidebar' }

describe('mergeLayoutForSave', () => {
  test('preserves a stored name when the body omits it (the reset bug)', () => {
    const existing: WorkspaceLayout = { ...base, name: 'Trip Photos' }
    const body: WorkspaceLayout = { ...base, widgetGrid: [{ i: 'a', x: 0, y: 0 }] }
    const merged = mergeLayoutForSave(existing, body)
    expect(merged.name).toBe('Trip Photos')
    expect(merged.widgetGrid).toEqual([{ i: 'a', x: 0, y: 0 }])
  })

  test('ignores a name the body carries — identity comes only from existing', () => {
    const existing: WorkspaceLayout = { ...base, name: 'Real Name' }
    // A stale client might round-trip the resolved/old name; it must not win.
    const body = { ...base, name: 'stale-folder-name' } as WorkspaceLayout
    expect(mergeLayoutForSave(existing, body).name).toBe('Real Name')
  })

  test('keeps the stored icon and ignores a stale icon in the body', () => {
    const existing: WorkspaceLayout = { ...base, icon: 'data:image/webp;base64,NEW' }
    const body = { ...base, icon: 'data:image/webp;base64,OLD' } as WorkspaceLayout
    expect(mergeLayoutForSave(existing, body).icon).toBe('data:image/webp;base64,NEW')
  })

  test('emits no name/icon keys when the workspace has neither (no undefined leak)', () => {
    const body = { ...base, name: 'x', icon: 'y' } as WorkspaceLayout
    const merged = mergeLayoutForSave(base, body)
    expect('name' in merged).toBe(false)
    expect('icon' in merged).toBe(false)
    // and it round-trips clean through JSON (the persisted shape)
    expect(JSON.parse(JSON.stringify(merged))).toEqual({
      version: 1,
      widgetGrid: [],
      chatMode: 'sidebar'
    })
  })

  test('passes editor-owned fields through from the body', () => {
    const existing: WorkspaceLayout = { ...base, name: 'Keep' }
    const body: WorkspaceLayout = {
      version: 1,
      widgetGrid: [{ i: 'w', x: 1, y: 2 }],
      chatMode: 'floating',
      selectedModel: 'sonnet',
      theme: { font: 'default', background: '#000', foreground: '#fff' }
    }
    const merged = mergeLayoutForSave(existing, body)
    expect(merged.chatMode).toBe('floating')
    expect(merged.selectedModel).toBe('sonnet')
    expect(merged.theme).toEqual({ font: 'default', background: '#000', foreground: '#fff' })
    expect(merged.name).toBe('Keep')
  })
})
