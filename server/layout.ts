import { join } from 'path'

import type { AppletKind, WorkspaceLayout, WorkspacePreview } from '@/lib/types'
import { createDefaultWorkspaceLayout, createDefaultWorkspaceTabs } from '@/lib/workspace-layout'
import { isWorkspaceTabId } from '@/lib/workspace-tabs'

import { getCapturedThumbnails } from './thumbnails'

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
  const defaults = createDefaultWorkspaceLayout()
  const layout = { ...defaults, ...parsed } as Record<string, unknown>
  if (layout.layoutMode !== 'split' && layout.layoutMode !== 'fullscreen') {
    layout.layoutMode = defaults.layoutMode
  }
  layout.tabs = normalizeTabs(layout.tabs)
  // Legacy thumbnail caches are intentionally dropped, not migrated — images
  // now live as files under `.moi/.cache/thumbnails` (server/thumbnails.ts)
  // and applets are simply captured again there.
  delete layout.widgetThumbnails
  delete layout.viewThumbnails
  delete layout.appletThumbnails
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
// as `name: undefined`.
export function mergeLayoutForSave(
  existing: WorkspaceLayout,
  body: WorkspaceLayout
): WorkspaceLayout {
  const { name: _name, icon: _icon, ...editor } = body
  // Stale clients may still round-trip the pre-`.cache` thumbnail records;
  // never let a layout PUT resurrect them in `.workspace.json`.
  delete (editor as Record<string, unknown>).appletThumbnails
  return {
    ...editor,
    ...(existing.name !== undefined && { name: existing.name }),
    ...(existing.icon !== undefined && { icon: existing.icon })
  }
}

// Thumbnails for the home screen's workspace card. Widgets take the front
// slots in grid order, then recent views fill what remains.
const PREVIEW_LIMIT = 3
const PREVIEW_MESSAGE_LIMIT = 240

function normalizePreviewMessage(message: string | undefined): string | undefined {
  const normalized = message?.replace(/\s+/g, ' ').trim()
  if (!normalized) return undefined
  if (normalized.length <= PREVIEW_MESSAGE_LIMIT) return normalized
  return `${normalized.slice(0, PREVIEW_MESSAGE_LIMIT - 1).trimEnd()}…`
}

export type WorkspacePreviewOptions = {
  getProviderPreview?: (includeFirstUserMessage: boolean) => Promise<{
    firstUserMessage?: string
    updatedAt?: number
  }>
  viewIds?: readonly string[]
  // Maps a captured applet to the image URL the home card should render —
  // the API layer owns the route shape (GET .../applet-thumbnails/:kind/:id).
  thumbnailUrl: (kind: AppletKind, id: string) => string
}

export async function getWorkspacePreview(
  workspacePath: string,
  { getProviderPreview, viewIds = [], thumbnailUrl }: WorkspacePreviewOptions
): Promise<WorkspacePreview> {
  try {
    const layout = await loadLayout(workspacePath)
    const captured = await getCapturedThumbnails(workspacePath)
    const validViewIds = new Set(viewIds)
    const capturedWidgets = new Set(
      captured.filter(record => record.kind === 'widget').map(record => record.id)
    )
    const widgetImages = [...layout.widgetGrid]
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .filter(item => capturedWidgets.has(item.i))
      .map(item => thumbnailUrl('widget', item.i))
    const viewImages = captured
      .filter(record => record.kind === 'view' && validViewIds.has(record.id))
      .sort((a, b) => Date.parse(b.viewedAt) - Date.parse(a.viewedAt))
      .map(record => thumbnailUrl('view', record.id))
    const thumbnails = [...widgetImages, ...viewImages].slice(0, PREVIEW_LIMIT)
    // The message bubble is the card's fallback for "nothing to show": gate on
    // captured thumbnails, not grid emptiness — a workspace with widgets that
    // were never captured (never opened in a browser) still renders an empty
    // folder otherwise.
    const includeFirstUserMessage = thumbnails.length === 0
    const providerPreview = await getProviderPreview?.(includeFirstUserMessage).catch(
      () => undefined
    )
    const updatedAt = providerPreview?.updatedAt
    const theme = layout.theme

    if (includeFirstUserMessage) {
      const firstUserMessage = normalizePreviewMessage(providerPreview?.firstUserMessage)
      return {
        thumbnails,
        ...(firstUserMessage ? { firstUserMessage } : {}),
        ...(updatedAt !== undefined ? { updatedAt } : {}),
        ...(theme ? { theme } : {})
      }
    }

    return {
      thumbnails,
      ...(updatedAt !== undefined ? { updatedAt } : {}),
      ...(theme ? { theme } : {})
    }
  } catch {
    return { thumbnails: [] }
  }
}
