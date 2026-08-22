import { describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'

import type { AppletKind, WorkspaceLayout } from '@/lib/types'

import { getLayoutPath, getWorkspacePreview, loadLayout, mergeLayoutForSave } from '../layout'
import { getThumbnailsDir } from '../thumbnails'

// The grid editor and `moi config` write the same `.workspace.json`. A layout
// PUT is authoritative for the editor fields but must NOT touch identity
// (name/icon) — otherwise the client's name-stripped body erases a configured
// name. mergeLayoutForSave enforces that.

const base: WorkspaceLayout = {
  version: 1,
  widgetGrid: [],
  layoutMode: 'fullscreen',
  tabs: { open: ['agent', 'widgets'], active: 'agent' }
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

// Seed the `.moi/.cache/thumbnails` store the preview reads from. Writing the
// index directly keeps `viewedAt` controllable (saves stamp the server clock).
async function seedThumbnails(
  dir: string,
  records: { kind: AppletKind; id: string; viewedAt?: string }[]
) {
  const cacheDir = getThumbnailsDir(dir)
  await mkdir(cacheDir, { recursive: true })
  const index = []
  for (const record of records) {
    const file = `${record.kind}-${record.id}.webp`
    await Bun.write(join(cacheDir, file), 'bytes')
    index.push({
      kind: record.kind,
      id: record.id,
      revision: 'revision',
      capturedAt: '2026-01-01T00:00:00.000Z',
      viewedAt: record.viewedAt ?? '2026-01-01T00:00:00.000Z',
      file
    })
  }
  await Bun.write(join(cacheDir, 'index.json'), JSON.stringify(index))
}

// Deterministic URL shape for assertions; the real one is the API route.
const thumbnailUrl = (kind: AppletKind, id: string) => `${kind}:${id}`

describe('loadLayout', () => {
  test('opens a new workspace in split view with the default tabs', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'moi-layout-'))
    try {
      const loaded = await loadLayout(dir)
      expect(loaded.layoutMode).toBe('split')
      expect(loaded.tabs).toEqual({
        open: ['agent', 'widgets', 'scratchpad'],
        active: 'agent'
      })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test('defaults missing layoutMode to split', async () => {
    await withWorkspaceFile({ version: 1, widgetGrid: [] }, async dir => {
      const loaded = await loadLayout(dir)
      expect(loaded.layoutMode).toBe('split')
      expect(loaded.tabs).toEqual({
        open: ['agent', 'widgets', 'scratchpad'],
        active: 'agent'
      })
    })
  })

  test('defaults invalid layoutMode to split', async () => {
    await withWorkspaceFile({ version: 1, widgetGrid: [], layoutMode: 'collapsed' }, async dir => {
      const loaded = await loadLayout(dir)
      expect(loaded.layoutMode).toBe('split')
    })
  })

  test('preserves valid fullscreen layoutMode', async () => {
    await withWorkspaceFile({ version: 1, widgetGrid: [], layoutMode: 'fullscreen' }, async dir => {
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

  test('defaults invalid tabs to the standard set', async () => {
    await withWorkspaceFile(
      { version: 1, widgetGrid: [], tabs: { open: [], active: 'widgets' } },
      async dir => {
        const loaded = await loadLayout(dir)
        expect(loaded.tabs).toEqual({
          open: ['agent', 'widgets', 'scratchpad'],
          active: 'agent'
        })
      }
    )
  })

  test('normalizes tabs and drops invalid tab ids', async () => {
    await withWorkspaceFile(
      {
        version: 1,
        widgetGrid: [],
        tabs: {
          open: [
            'widgets',
            'bad',
            'view:dashboard',
            'view-builder:builder-1',
            'widgets',
            'scratchpad'
          ],
          active: 'bad'
        }
      },
      async dir => {
        const loaded = await loadLayout(dir)
        expect(loaded.tabs).toEqual({
          open: ['widgets', 'view:dashboard', 'view-builder:builder-1', 'scratchpad'],
          active: 'widgets'
        })
      }
    )
  })

  test('drops legacy thumbnail caches without migrating them', async () => {
    await withWorkspaceFile(
      {
        ...base,
        widgetThumbnails: { key: 'old', images: { widget: 'image' } },
        viewThumbnails: [{ viewId: 'view', image: 'image' }],
        appletThumbnails: [{ kind: 'widget', id: 'w', revision: 'r', image: 'inline-image' }]
      },
      async dir => {
        const loaded = await loadLayout(dir)
        expect('widgetThumbnails' in loaded).toBe(false)
        expect('viewThumbnails' in loaded).toBe(false)
        expect('appletThumbnails' in loaded).toBe(false)
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
      tabs: { open: ['agent', 'widgets'], active: 'agent' }
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
      selectedFastMode: false,
      theme: { font: 'sans', color: 'rose', radius: 'square', agent: 'triangle' }
    }
    const merged = mergeLayoutForSave(existing, body)
    expect(merged.layoutMode).toBe('split')
    expect(merged.tabs).toEqual({ open: ['agent', 'widgets'], active: 'widgets' })
    expect(merged.selectedModel).toBe('sonnet')
    expect(merged.selectedFastMode).toBe(false)
    expect(merged.theme).toEqual({
      font: 'sans',
      color: 'rose',
      radius: 'square',
      agent: 'triangle'
    })
    expect(merged.name).toBe('Keep')
  })

  test('never lets a stale client write thumbnail records back into the layout', () => {
    const body = {
      ...base,
      appletThumbnails: [{ kind: 'widget', id: 'w', image: 'inline-image' }]
    } as unknown as WorkspaceLayout
    expect('appletThumbnails' in mergeLayoutForSave(base, body)).toBe(false)
  })
})

describe('getWorkspacePreview', () => {
  test('includes the persisted workspace theme', async () => {
    const theme = {
      font: 'sans' as const,
      color: 'rose' as const,
      radius: 'squishy' as const,
      agent: 'capsule' as const
    }
    await withWorkspaceFile(
      {
        ...base,
        theme
      },
      async dir => {
        expect(await getWorkspacePreview(dir, { thumbnailUrl })).toEqual({
          thumbnails: [],
          theme
        })
      }
    )
  })

  test('sorts thumbnails top-to-bottom and left-to-right, then caps the stack', async () => {
    await withWorkspaceFile(
      {
        ...base,
        widgetGrid: [
          { i: 'bottom', x: 0, y: 2 },
          { i: 'fourth', x: 0, y: 3 },
          { i: 'right', x: 2, y: 0 },
          { i: 'left', x: 0, y: 0 }
        ]
      },
      async dir => {
        await seedThumbnails(dir, [
          { kind: 'widget', id: 'stale' },
          { kind: 'widget', id: 'right' },
          { kind: 'widget', id: 'bottom' },
          { kind: 'widget', id: 'fourth' },
          { kind: 'widget', id: 'left' }
        ])
        expect(await getWorkspacePreview(dir, { thumbnailUrl })).toEqual({
          thumbnails: ['widget:left', 'widget:right', 'widget:bottom']
        })
      }
    )
  })

  test('puts widgets first and fills remaining slots with recent views', async () => {
    await withWorkspaceFile(
      {
        ...base,
        widgetGrid: [{ i: 'widget', x: 0, y: 0 }]
      },
      async dir => {
        await seedThumbnails(dir, [
          { kind: 'widget', id: 'widget' },
          { kind: 'view', id: 'deleted', viewedAt: '2026-01-04T00:00:00.000Z' },
          { kind: 'view', id: 'recent', viewedAt: '2026-01-03T00:00:00.000Z' },
          { kind: 'view', id: 'older', viewedAt: '2026-01-02T00:00:00.000Z' }
        ])
        expect(
          await getWorkspacePreview(dir, { viewIds: ['older', 'recent'], thumbnailUrl })
        ).toEqual({
          thumbnails: ['widget:widget', 'view:recent', 'view:older']
        })
      }
    )
  })

  test('uses widgets when stored view thumbnails belong to deleted views', async () => {
    await withWorkspaceFile(
      {
        ...base,
        widgetGrid: [{ i: 'widget', x: 0, y: 0 }]
      },
      async dir => {
        await seedThumbnails(dir, [
          { kind: 'widget', id: 'widget' },
          { kind: 'view', id: 'deleted' }
        ])
        expect(await getWorkspacePreview(dir, { viewIds: [], thumbnailUrl })).toEqual({
          thumbnails: ['widget:widget']
        })
      }
    )
  })

  test('loads and normalizes the first user message when the grid is empty', async () => {
    await withWorkspaceFile(base, async dir => {
      const message = `  ${'A'.repeat(260)}\nsecond line  `
      const preview = await getWorkspacePreview(dir, {
        getProviderPreview: async includeFirstUserMessage => ({
          firstUserMessage: includeFirstUserMessage ? message : undefined,
          updatedAt: 900
        }),
        thumbnailUrl
      })

      expect(preview.thumbnails).toEqual([])
      expect(preview.updatedAt).toBe(900)
      expect(preview.firstUserMessage?.length).toBe(240)
      expect(preview.firstUserMessage?.endsWith('…')).toBe(true)
      expect(preview.firstUserMessage).not.toContain('\n')
    })
  })

  test('loads the message fallback when widgets exist without thumbnails', async () => {
    await withWorkspaceFile(
      {
        ...base,
        widgetGrid: [{ i: 'waiting-for-thumbnail', x: 0, y: 0 }]
      },
      async dir => {
        const preview = await getWorkspacePreview(dir, {
          getProviderPreview: async includeFirstUserMessage => {
            expect(includeFirstUserMessage).toBe(true)
            return {
              firstUserMessage: 'Shown until a capture lands',
              updatedAt: 900
            }
          },
          thumbnailUrl
        })

        expect(preview).toEqual({
          thumbnails: [],
          firstUserMessage: 'Shown until a capture lands',
          updatedAt: 900
        })
      }
    )
  })

  test('does not load the message fallback when thumbnails exist', async () => {
    await withWorkspaceFile(
      {
        ...base,
        widgetGrid: [{ i: 'captured', x: 0, y: 0 }]
      },
      async dir => {
        await seedThumbnails(dir, [{ kind: 'widget', id: 'captured' }])
        const preview = await getWorkspacePreview(dir, {
          getProviderPreview: async includeFirstUserMessage => {
            expect(includeFirstUserMessage).toBe(false)
            return {
              firstUserMessage: 'Should stay hidden',
              updatedAt: 900
            }
          },
          thumbnailUrl
        })

        expect(preview).toEqual({ thumbnails: ['widget:captured'], updatedAt: 900 })
      }
    )
  })

  test('keeps an empty folder when the fallback is empty or unreadable', async () => {
    await withWorkspaceFile(base, async dir => {
      expect(
        await getWorkspacePreview(dir, {
          getProviderPreview: async () => ({ firstUserMessage: ' \n ' }),
          thumbnailUrl
        })
      ).toEqual({
        thumbnails: []
      })
      expect(
        await getWorkspacePreview(dir, {
          getProviderPreview: async () => {
            throw new Error('unreadable session')
          },
          thumbnailUrl
        })
      ).toEqual({ thumbnails: [] })
    })
  })
})
