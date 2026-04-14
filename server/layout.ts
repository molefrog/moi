import { join } from 'path'

import type { WorkspaceLayout } from '@/lib/types'

const DEFAULT: WorkspaceLayout = {
  version: 1,
  widgetGrid: [],
  chatMode: 'sidebar'
}

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
