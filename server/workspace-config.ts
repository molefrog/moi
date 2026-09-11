import type { WorkspaceIcon, WorkspaceLayout } from '@/lib/types'

import { loadLayout, saveLayout } from './layout'

// Workspace identity stored in the layout: a display-name override, an icon,
// and its optional host-painted background.
export type WorkspaceConfig = {
  name?: string
  icon?: WorkspaceIcon
}

export type WorkspaceConfigPatch = {
  name?: string | null
  icon?: WorkspaceIcon | null
}

export async function getWorkspaceConfig(workspacePath: string): Promise<WorkspaceConfig> {
  const layout = await loadLayout(workspacePath)
  return { name: layout.name, icon: layout.icon }
}

// Apply an identity patch to the workspace layout. For each field: a value sets
// it, `null` clears it, and `undefined` leaves it unchanged. Clearing the icon
// always clears its presentation metadata too.
export async function setWorkspaceConfig(
  workspacePath: string,
  patch: WorkspaceConfigPatch
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
