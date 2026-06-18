import type { WorkspaceLayout } from '@/lib/types'

import { loadLayout, saveLayout } from './layout'

// Workspace identity stored in the layout: a display-name override and an icon
// (base64 data URL). Both optional; absent values fall back to provider/folder
// defaults at the API layer.
export type WorkspaceConfig = {
  name?: string
  icon?: string
}

export async function getWorkspaceConfig(workspacePath: string): Promise<WorkspaceConfig> {
  const layout = await loadLayout(workspacePath)
  return { name: layout.name, icon: layout.icon }
}

// Apply a name/icon patch to the workspace layout. For each field: a value
// sets it, `null` clears it, and `undefined` leaves it unchanged. Callers
// broadcast `workspace:updated` afterwards to refresh connected clients.
export async function setWorkspaceConfig(
  workspacePath: string,
  patch: { name?: string | null; icon?: string | null }
): Promise<WorkspaceLayout> {
  const layout = await loadLayout(workspacePath)
  const next: WorkspaceLayout = { ...layout }
  if (patch.name !== undefined) {
    if (patch.name) next.name = patch.name
    else delete next.name
  }
  if (patch.icon !== undefined) {
    if (patch.icon) next.icon = patch.icon
    else delete next.icon
  }
  await saveLayout(next, workspacePath)
  return next
}
