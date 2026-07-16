import { readdir } from 'node:fs/promises'
import { join } from 'path'

import type { WidgetConfig, WorkspaceLayout, WorkspacePreview, WorkspaceTabId } from '@/lib/types'
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

const DEFAULT_WIDGET_CONFIG: WidgetConfig = { rowSpan: 1, colSpan: 2 }
const PREVIEW_COLS = 4
const EMPTY_PREVIEW: WorkspacePreview = { cols: PREVIEW_COLS, items: [] }

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
// `name`/`icon` from `existing` — conditionally, so an absent field never
// serializes as `name: undefined`.
export function mergeLayoutForSave(
  existing: WorkspaceLayout,
  body: WorkspaceLayout
): WorkspaceLayout {
  const { name: _name, icon: _icon, ...editor } = body
  return {
    ...editor,
    ...(existing.name !== undefined && { name: existing.name }),
    ...(existing.icon !== undefined && { icon: existing.icon })
  }
}

async function scanWidgetIds(workspacePath: string): Promise<Set<string>> {
  try {
    const entries = await readdir(join(workspacePath, '.moi', 'widgets'))
    return new Set(
      entries
        .filter(f => /\.(tsx|ts)$/.test(f) && !f.endsWith('.server.ts'))
        .map(f => f.replace(/\.tsx?$/, ''))
    )
  } catch {
    return new Set()
  }
}

export async function getWorkspacePreview(workspacePath: string): Promise<WorkspacePreview> {
  try {
    const layout = await loadLayout(workspacePath)
    if (!Array.isArray(layout.widgetGrid) || layout.widgetGrid.length === 0) return EMPTY_PREVIEW

    const validIds = await scanWidgetIds(workspacePath)
    if (validIds.size === 0) return EMPTY_PREVIEW

    let manifest: Record<string, WidgetConfig> = {}
    try {
      const manifestPath = join(workspacePath, '.moi', '.build', 'widgets', 'manifest.json')
      const parsed = JSON.parse(await Bun.file(manifestPath).text())
      if (parsed && typeof parsed.config === 'object' && parsed.config !== null) {
        manifest = parsed.config as Record<string, WidgetConfig>
      }
    } catch {}

    const items = layout.widgetGrid
      .map(({ i, x, y }) => {
        if (!validIds.has(i)) return null
        const cfg = manifest[i] ?? DEFAULT_WIDGET_CONFIG
        if (
          typeof x !== 'number' ||
          typeof y !== 'number' ||
          typeof cfg.colSpan !== 'number' ||
          typeof cfg.rowSpan !== 'number'
        ) {
          return null
        }
        return { x, y, w: cfg.colSpan, h: cfg.rowSpan }
      })
      .filter((v): v is { x: number; y: number; w: number; h: number } => v !== null)

    return { cols: PREVIEW_COLS, items }
  } catch {
    return EMPTY_PREVIEW
  }
}
