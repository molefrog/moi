import { join } from 'path'

import type {
  AppletKind,
  AppletThumbnail,
  AppletThumbnailBatch,
  WorkspaceLayout,
  WorkspacePreview
} from '@/lib/types'
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
  const defaults = createDefaultWorkspaceLayout()
  const layout = { ...defaults, ...parsed } as Record<string, unknown>
  if (layout.layoutMode !== 'split' && layout.layoutMode !== 'fullscreen') {
    layout.layoutMode = defaults.layoutMode
  }
  layout.tabs = normalizeTabs(layout.tabs)
  if (!Array.isArray(layout.appletThumbnails)) delete layout.appletThumbnails
  // Thumbnail caches from the two feature-specific implementations are
  // intentionally dropped. Applets are captured again into the shared model.
  delete layout.widgetThumbnails
  delete layout.viewThumbnails
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
// as `name: undefined`. Applet thumbnails have their own endpoint and the layout
// GET omits their image bytes, so normal layout writes preserve the stored set.
export function mergeLayoutForSave(
  existing: WorkspaceLayout,
  body: WorkspaceLayout
): WorkspaceLayout {
  const { name: _name, icon: _icon, appletThumbnails: _appletThumbnails, ...editor } = body
  return {
    ...editor,
    ...(existing.name !== undefined && { name: existing.name }),
    ...(existing.icon !== undefined && { icon: existing.icon }),
    ...(existing.appletThumbnails !== undefined && {
      appletThumbnails: existing.appletThumbnails
    })
  }
}

const PREVIEW_LIMIT = 3

// Merge a settled applet batch into the one shared thumbnail store. A string
// replaces the image, null records a failed attempt while keeping any previous
// image, and an omitted image only updates visit recency.
export async function saveAppletThumbnails(
  workspacePath: string,
  kind: AppletKind,
  updates: AppletThumbnailBatch['thumbnails']
): Promise<void> {
  const existing = await loadLayout(workspacePath)
  const now = new Date().toISOString()
  const records = [...(existing.appletThumbnails ?? [])]

  for (const update of updates) {
    const index = records.findIndex(record => record.kind === kind && record.id === update.id)
    const previous = records[index]

    if (update.image === undefined) {
      if (previous) records[index] = { ...previous, viewedAt: now }
      continue
    }

    const record: AppletThumbnail = {
      kind,
      id: update.id,
      revision: update.revision,
      capturedAt: now,
      viewedAt: now,
      ...(typeof update.image === 'string'
        ? { image: update.image }
        : previous?.image !== undefined
          ? { image: previous.image }
          : {})
    }
    if (previous) records[index] = record
    else records.push(record)
  }

  await saveLayout({ ...existing, appletThumbnails: records }, workspacePath)
}

// Thumbnails for the home screen's workspace card. Widgets take the front
// slots in grid order, then recent views fill what remains.
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
  }>,
  viewIds: readonly string[] = []
): Promise<WorkspacePreview> {
  try {
    const layout = await loadLayout(workspacePath)
    const records = layout.appletThumbnails ?? []
    const validViewIds = new Set(viewIds)
    const recordByKey = new Map(records.map(record => [`${record.kind}:${record.id}`, record]))
    const widgetImages = [...layout.widgetGrid]
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .map(item => recordByKey.get(`widget:${item.i}`)?.image)
      .filter((image): image is string => typeof image === 'string')
    const viewImages = records
      .filter(
        record =>
          record.kind === 'view' && validViewIds.has(record.id) && typeof record.image === 'string'
      )
      .sort((a, b) => Date.parse(b.viewedAt) - Date.parse(a.viewedAt))
      .map(record => record.image as string)
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
