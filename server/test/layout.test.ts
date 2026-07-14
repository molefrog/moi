import { describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'

import type { WorkspaceLayout } from '@/lib/types'

import { getLayoutPath, loadLayout, mergeLayoutForSave } from '../layout'

// The grid editor and `moi config` write the same `.workspace.json`. A layout
// PUT is authoritative for the editor fields but must NOT touch identity
// (name/icon) — otherwise the client's name-stripped body erases a configured
// name. mergeLayoutForSave enforces that.

const base: WorkspaceLayout = {
  version: 1,
  widgetGrid: [],
  layoutMode: 'fullscreen',
  tabs: { open: ['agent'], active: 'agent' }
}

async function withWorkspaceFile<T>(
  body: Record<string, unknown>,
  fn: (dir: string) => Promise<T>
) {
  const dir = await mkdtemp(join(tmpdir(), 'moi-layout-'))
  try {
    const file = getLayoutPath(dir)
    await mkdir(dirname(file), { recursive: true })
    await Bun.write(file, JSON.stringify(body, null, 2))
    return await fn(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

describe('loadLayout', () => {
  test('defaults missing layoutMode to fullscreen', async () => {
    await withWorkspaceFile({ version: 1, widgetGrid: [] }, async dir => {
      const loaded = await loadLayout(dir)
      expect(loaded.layoutMode).toBe('fullscreen')
      expect(loaded.tabs).toEqual({ open: ['agent'], active: 'agent' })
    })
  })

  test('defaults invalid layoutMode to fullscreen', async () => {
    await withWorkspaceFile({ version: 1, widgetGrid: [], layoutMode: 'collapsed' }, async dir => {
      const loaded = await loadLayout(dir)
      expect(loaded.layoutMode).toBe('fullscreen')
    })
  })

  test('preserves valid split layoutMode', async () => {
    await withWorkspaceFile({ version: 1, widgetGrid: [], layoutMode: 'split' }, async dir => {
      const loaded = await loadLayout(dir)
      expect(loaded.layoutMode).toBe('split')
    })
  })

  test('defaults invalid tabs to agent', async () => {
    await withWorkspaceFile(
      { version: 1, widgetGrid: [], tabs: { open: [], active: 'widgets' } },
      async dir => {
        const loaded = await loadLayout(dir)
        expect(loaded.tabs).toEqual({ open: ['agent'], active: 'agent' })
      }
    )
  })

  test('normalizes tabs and drops invalid tab ids', async () => {
    await withWorkspaceFile(
      {
        version: 1,
        widgetGrid: [],
        tabs: {
          open: ['widgets', 'bad', 'view:dashboard', 'widgets', 'scratchpad'],
          active: 'bad'
        }
      },
      async dir => {
        const loaded = await loadLayout(dir)
        expect(loaded.tabs).toEqual({
          open: ['widgets', 'view:dashboard', 'scratchpad'],
          active: 'widgets'
        })
      }
    )
  })
})

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
      layoutMode: 'fullscreen',
      tabs: { open: ['agent'], active: 'agent' }
    })
  })

  test('passes editor-owned fields through from the body', () => {
    const existing: WorkspaceLayout = { ...base, name: 'Keep' }
    const body: WorkspaceLayout = {
      version: 1,
      widgetGrid: [{ i: 'w', x: 1, y: 2 }],
      layoutMode: 'split',
      tabs: { open: ['agent', 'widgets'], active: 'widgets' },
      selectedModel: 'sonnet',
      theme: { font: 'default', background: '#000', foreground: '#fff' }
    }
    const merged = mergeLayoutForSave(existing, body)
    expect(merged.layoutMode).toBe('split')
    expect(merged.tabs).toEqual({ open: ['agent', 'widgets'], active: 'widgets' })
    expect(merged.selectedModel).toBe('sonnet')
    expect(merged.theme).toEqual({ font: 'default', background: '#000', foreground: '#fff' })
    expect(merged.name).toBe('Keep')
  })
})
