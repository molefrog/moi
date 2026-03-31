import { join } from 'path'

import type { WorkspaceLayout } from '@/lib/types'

const LAYOUT_PATH = join(import.meta.dir, '..', 'workspace', 'mei', '.workspace.json')

const DEFAULT: WorkspaceLayout = {
  version: 1,
  widgetGrid: [],
  chatMode: 'sidebar'
}

export async function loadLayout(): Promise<WorkspaceLayout> {
  try {
    const text = await Bun.file(LAYOUT_PATH).text()
    const parsed = JSON.parse(text)
    if (parsed?.version === 1) return parsed as WorkspaceLayout
  } catch {}
  return { ...DEFAULT }
}

export async function saveLayout(layout: WorkspaceLayout): Promise<void> {
  await Bun.write(LAYOUT_PATH, JSON.stringify(layout, null, 2))
}
