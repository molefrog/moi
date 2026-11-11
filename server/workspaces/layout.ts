import {
  parseRemoteWorkspaceConfig,
  personalWorkspaceConfig,
  type WorkspaceFileConfig,
  type WorkspacePersonalConfig
} from '@/lib/workspace-config'
import { join } from 'path'
import { isSpeedMode } from '@/lib/speed-mode'

import type {
  AppletKind,
  WorkspaceLayout,
  WorkspaceLayoutSave,
  WorkspacePreview
} from '@/lib/types'
import { createDefaultWorkspaceLayout, normalizeWorkspaceTabs } from '@/lib/workspace-layout'
import { isWorkspaceIcon } from '@/lib/workspace-icon'

import { getCapturedThumbnails } from '../applets/thumbnails'

function normalizeLayout(parsed: Record<string, unknown>): WorkspaceLayout {
  const defaults = createDefaultWorkspaceLayout()
  const layout = { ...defaults, ...parsed } as Record<string, unknown>
  if (layout.layoutMode !== 'split' && layout.layoutMode !== 'fullscreen') {
    layout.layoutMode = defaults.layoutMode
  }
  layout.tabs = normalizeWorkspaceTabs(layout.tabs)
  if (!isSpeedMode(layout.selectedSpeedMode)) delete layout.selectedSpeedMode
  delete layout.selectedFastMode
  if (typeof layout.icon === 'string') {
    layout.icon = { type: 'upload', value: layout.icon }
  } else if (layout.icon !== undefined && !isWorkspaceIcon(layout.icon)) {
    delete layout.icon
  }
  // Legacy thumbnail caches are intentionally dropped, not migrated — images
  // now live as files under `.moi/.cache/thumbnails` (server/applets/thumbnails.ts)
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

// This module remains the sole owner of workspace config persistence.
export async function loadWorkspaceFileConfig(workspacePath: string): Promise<WorkspaceFileConfig> {
  const file = Bun.file(getLayoutPath(workspacePath))
  if (!(await file.exists())) return { ...createDefaultWorkspaceLayout(), version: 2 }
  const parsed: unknown = await file.json()
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new Error('Invalid workspace config')
  const value = parsed as Record<string, unknown>
  if ('remote' in value) return parseRemoteWorkspaceConfig(value)
  if (value.version !== 1 && value.version !== 2)
    throw new Error('Unsupported workspace config version')
  const {
    layoutMode: _mode,
    selectedModel: _model,
    selectedEffort: _effort,
    selectedSpeedMode: _speed,
    ...shared
  } = normalizeLayout(value)
  return { ...shared, ...personalWorkspaceConfig(value), version: 2 }
}

export async function loadLayout(workspacePath: string): Promise<WorkspaceLayout> {
  const config = await loadWorkspaceFileConfig(workspacePath)
  if (config.remote) throw new Error('Remote workspace has no local layout')
  return { ...config, layoutMode: config.layoutMode ?? 'split' }
}

export async function saveLayout(layout: WorkspaceLayout, workspacePath: string): Promise<void> {
  const existing = await loadWorkspaceFileConfig(workspacePath)
  if (existing.remote)
    throw new Error('Cannot replace a remote workspace reference with a local layout')
  await Bun.write(getLayoutPath(workspacePath), JSON.stringify({ ...layout, version: 2 }, null, 2))
}

export async function saveWorkspacePersonalConfig(
  patch: WorkspacePersonalConfig,
  workspacePath: string
): Promise<void> {
  const existing = await loadWorkspaceFileConfig(workspacePath)
  const next = { ...existing, ...personalWorkspaceConfig({ ...existing, ...patch }), version: 2 }
  await Bun.write(getLayoutPath(workspacePath), JSON.stringify(next, null, 2))
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
  body: WorkspaceLayoutSave
): WorkspaceLayout {
  const { name: _name, icon: _icon, ...editor } = body
  // Stale clients may still round-trip the pre-`.cache` thumbnail records;
  // never let a layout PUT resurrect them in `.workspace.json`.
  delete (editor as Record<string, unknown>).appletThumbnails
  return {
    ...editor,
    // Personal navigation never writes tabs. Other layout edits must not
    // round-trip a stale copy of the workspace's authored defaults.
    tabs: editor.tabs === undefined ? existing.tabs : normalizeWorkspaceTabs(editor.tabs),
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
  // `version` changes with every capture, so the URL can be cached forever.
  thumbnailUrl: (kind: AppletKind, id: string, version: string) => string
}

export async function getWorkspacePreview(
  workspacePath: string,
  { getProviderPreview, viewIds = [], thumbnailUrl }: WorkspacePreviewOptions
): Promise<WorkspacePreview> {
  try {
    const layout = await loadLayout(workspacePath)
    const captured = await getCapturedThumbnails(workspacePath)
    const validViewIds = new Set(viewIds)
    const capturedWidgets = new Map(
      captured
        .filter(record => record.kind === 'widget')
        .map(record => [record.id, record.capturedAt])
    )
    const widgetImages = [...layout.widgetGrid]
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .flatMap(item => {
        const version = capturedWidgets.get(item.i)
        return version === undefined ? [] : [thumbnailUrl('widget', item.i, version)]
      })
    const viewImages = captured
      .filter(record => record.kind === 'view' && validViewIds.has(record.id))
      .sort((a, b) => Date.parse(b.viewedAt) - Date.parse(a.viewedAt))
      .map(record => thumbnailUrl('view', record.id, record.capturedAt))
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
