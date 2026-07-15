import { join } from 'path'

import type { WorkspaceLayout, WorkspacePreview, WorkspaceTabId } from '@/lib/types'
import { createDefaultWorkspaceLayout, createDefaultWorkspaceTabs } from '@/lib/workspace-layout'

function isTabId(value: unknown): value is WorkspaceTabId {
  return (
    value === 'agent' ||
    value === 'widgets' ||
    value === 'scratchpad' ||
    (typeof value === 'string' && (/^view:.+/.test(value) || /^view-builder:.+/.test(value)))
  )
}

function normalizeTabs(value: unknown): WorkspaceLayout['tabs'] {
  if (!value || typeof value !== 'object') return createDefaultWorkspaceTabs()
  const raw = value as Record<string, unknown>
  const open = Array.isArray(raw.open)
    ? raw.open.filter(isTabId).filter((tab, index, all) => all.indexOf(tab) === index)
    : []
  if (open.length === 0) return createDefaultWorkspaceTabs()
  const active = isTabId(raw.active) && open.includes(raw.active) ? raw.active : open[0]
  return { open, active }
}

function normalizeLayout(parsed: Record<string, unknown>): WorkspaceLayout {
  const layout = { ...createDefaultWorkspaceLayout(), ...parsed } as Record<string, unknown>
  if (layout.layoutMode !== 'split') layout.layoutMode = 'fullscreen'
  layout.tabs = normalizeTabs(layout.tabs)
  delete layout.sectionMode
  delete layout.chatMode
  return layout as unknown as WorkspaceLayout
}

export function getLayoutPath(workspacePath: string): string {
  return join(workspacePath, '.moi', '.workspace.json')
}

export async function loadLayout(workspacePath: string): Promise<WorkspaceLayout> {
  try {
    const text = await Bun.file(getLayoutPath(workspacePath)).text()
    const parsed = JSON.parse(text)
    if (parsed?.version === 1) return normalizeLayout(parsed)
  } catch {}
  return createDefaultWorkspaceLayout()
}

export async function saveLayout(layout: WorkspaceLayout, workspacePath: string): Promise<void> {
  await Bun.write(getLayoutPath(workspacePath), JSON.stringify(layout, null, 2))
}

// Merge a client-submitted layout over the stored one for persistence.
//
// Everything (grid, layout mode, theme, AND identity) shares one
// `.workspace.json`, but the grid editor and `moi config` own different fields.
// The client's layout PUT is authoritative for the editor fields (widgetGrid,
// layoutMode, theme, selectedModel) — but it strips `name` and round-trips a
// possibly-stale `icon`.
// A blind overwrite therefore erases a `moi config`-set name (and could revert an
// icon). So drop whatever identity the body carries and re-apply the server-owned
// fields from `existing` — conditionally, so an absent field never serializes
// as `name: undefined`. Widget thumbnails are likewise not the layout PUT's to
// write: they have their own endpoint (saveWidgetThumbnails), and the layout
// GET doesn't even ship the map — a round-trip would erase it.
export function mergeLayoutForSave(
  existing: WorkspaceLayout,
  body: WorkspaceLayout
): WorkspaceLayout {
  const { name: _name, icon: _icon, widgetThumbnails: _thumbnails, ...editor } = body
  return {
    ...editor,
    ...(existing.name !== undefined && { name: existing.name }),
    ...(existing.icon !== undefined && { icon: existing.icon }),
    ...(existing.widgetThumbnails !== undefined && {
      widgetThumbnails: existing.widgetThumbnails
    })
  }
}

// Merge a captured thumbnail set into the stored layout. Lives beside
// mergeLayoutForSave but on its own write path (PUT .../thumbnails): grid and
// theme saves never carry the base64 map, and a thumbnail save can't touch
// the grid. Entries merge over the existing map — removed widgets keep their
// last image.
export async function saveWidgetThumbnails(
  workspacePath: string,
  key: string,
  images: Record<string, string>
): Promise<void> {
  const existing = await loadLayout(workspacePath)
  await saveLayout(
    {
      ...existing,
      widgetThumbnails: {
        key,
        // Server clock, so age-based invalidation doesn't trust client time.
        at: new Date().toISOString(),
        images: { ...existing.widgetThumbnails?.images, ...images }
      }
    },
    workspacePath
  )
}

// Thumbnails for the home screen's workspace card: a few captured widget
// images from the stored layout (see saveWidgetThumbnails). The card renders
// them as a loose stack, so the cap just keeps the payload small — anything
// past it would hide under the pile anyway.
const PREVIEW_LIMIT = 4

export async function getWorkspacePreview(workspacePath: string): Promise<WorkspacePreview> {
  try {
    const layout = await loadLayout(workspacePath)
    return {
      thumbnails: Object.values(layout.widgetThumbnails?.images ?? {}).slice(0, PREVIEW_LIMIT)
    }
  } catch {
    return { thumbnails: [] }
  }
}
