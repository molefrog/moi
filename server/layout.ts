import { readdir } from 'node:fs/promises'
import { join } from 'path'

import type { WidgetConfig, WorkspaceLayout, WorkspacePreview } from '@/lib/types'

const DEFAULT: WorkspaceLayout = {
  version: 1,
  widgetGrid: [],
  chatMode: 'sidebar'
}

const DEFAULT_WIDGET_CONFIG: WidgetConfig = { rowSpan: 1, colSpan: 2 }
const PREVIEW_COLS = 4
const EMPTY_PREVIEW: WorkspacePreview = { cols: PREVIEW_COLS, items: [] }

export function getLayoutPath(workspacePath: string): string {
  return join(workspacePath, '.widgets', '.workspace.json')
}

export async function loadLayout(workspacePath: string): Promise<WorkspaceLayout> {
  try {
    const text = await Bun.file(getLayoutPath(workspacePath)).text()
    const parsed = JSON.parse(text)
    if (parsed?.version === 1) return parsed as WorkspaceLayout
  } catch {}
  return { ...DEFAULT }
}

export async function saveLayout(layout: WorkspaceLayout, workspacePath: string): Promise<void> {
  await Bun.write(getLayoutPath(workspacePath), JSON.stringify(layout, null, 2))
}

async function scanWidgetIds(workspacePath: string): Promise<Set<string>> {
  try {
    const entries = await readdir(join(workspacePath, '.widgets'))
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
      const manifestPath = join(workspacePath, '.widgets', '.build', 'widgets', 'manifest.json')
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
