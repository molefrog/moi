import { join } from 'path'

import type { WorkspaceLayout, WorkspacePreview } from '@/lib/types'
import { createDefaultWorkspaceLayout, createDefaultWorkspaceTabs } from '@/lib/workspace-layout'
import { isWorkspaceTabId } from '@/lib/workspace-tabs'

function normalizeTabs(value: unknown): WorkspaceLayout['tabs'] {
  if (!value || typeof value !== 'object') return createDefaultWorkspaceTabs()
  const raw = value as Record<string, unknown>
  const open = Array.isArray(raw.open)
    ? raw.open.filter(isWorkspaceTabId).filter((tab, index, all) => all.indexOf(tab) === index)
    : []
  if (open.length === 0) return createDefaultWorkspaceTabs()
  const active = isWorkspaceTabId(raw.active) && open.includes(raw.active) ? raw.active : open[0]
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
const PREVIEW_LIMIT = 3
const PREVIEW_MESSAGE_LIMIT = 240

function normalizePreviewMessage(message: string | undefined): string | undefined {
  const normalized = message?.replace(/\s+/g, ' ').trim()
  if (!normalized) return undefined
  if (normalized.length <= PREVIEW_MESSAGE_LIMIT) return normalized
  return `${normalized.slice(0, PREVIEW_MESSAGE_LIMIT - 1).trimEnd()}…`
}

export async function getWorkspacePreview(
  workspacePath: string,
  getProviderPreview?: (includeFirstUserMessage: boolean) => Promise<{
    firstUserMessage?: string
    updatedAt?: number
  }>
): Promise<WorkspacePreview> {
  try {
    const layout = await loadLayout(workspacePath)
    const images = layout.widgetThumbnails?.images ?? {}
    const thumbnails = [...layout.widgetGrid]
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .map(item => images[item.i])
      .filter((image): image is string => typeof image === 'string')
      .slice(0, PREVIEW_LIMIT)
    // The message bubble is the card's fallback for "nothing to show": gate on
    // captured thumbnails, not grid emptiness — a workspace with widgets that
    // were never captured (never opened in a browser) still renders an empty
    // folder otherwise.
    const includeFirstUserMessage = thumbnails.length === 0
    const providerPreview = await getProviderPreview?.(includeFirstUserMessage).catch(
      () => undefined
    )
    const updatedAt = providerPreview?.updatedAt

    if (includeFirstUserMessage) {
      const firstUserMessage = normalizePreviewMessage(providerPreview?.firstUserMessage)
      return {
        thumbnails,
        ...(firstUserMessage ? { firstUserMessage } : {}),
        ...(updatedAt !== undefined ? { updatedAt } : {})
      }
    }

    return {
      thumbnails,
      ...(updatedAt !== undefined ? { updatedAt } : {})
    }
  } catch {
    return { thumbnails: [] }
  }
}
