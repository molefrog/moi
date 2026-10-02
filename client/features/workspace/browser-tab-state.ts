import { useCallback, useState } from 'react'

import type { WorkspaceTabsState } from '@/lib/types'
import { normalizeWorkspaceTabs } from '@/lib/workspace-layout'

const keyFor = (workspaceId: string) => `moi:collab:${workspaceId}:tabs`

export function readWorkspaceTabs(
  workspaceId: string,
  defaults: WorkspaceTabsState
): WorkspaceTabsState {
  try {
    const saved = sessionStorage.getItem(keyFor(workspaceId))
    return saved ? normalizeWorkspaceTabs(JSON.parse(saved)) : defaults
  } catch {
    return defaults
  }
}

export function writeWorkspaceTabs(workspaceId: string, tabs: WorkspaceTabsState): void {
  try {
    sessionStorage.setItem(keyFor(workspaceId), JSON.stringify(tabs))
  } catch {
    // The hook retains its in-memory selection when browser storage is denied.
  }
}

export function useWorkspaceTabs(
  workspaceId: string,
  enabled: boolean,
  defaults: WorkspaceTabsState
) {
  const [local, setLocal] = useState<WorkspaceTabsState>(() =>
    enabled ? readWorkspaceTabs(workspaceId, defaults) : defaults
  )
  const setTabs = useCallback(
    (tabs: WorkspaceTabsState) => {
      setLocal(tabs)
      writeWorkspaceTabs(workspaceId, tabs)
    },
    [workspaceId]
  )
  return [enabled ? local : defaults, setTabs] as const
}
