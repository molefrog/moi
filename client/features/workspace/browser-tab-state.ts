import { useCallback, useMemo, useState } from 'react'

import type { WorkspaceTabsState } from '@/lib/types'
import { normalizeWorkspaceTabs } from '@/lib/workspace-layout'
import { useCollabEnabled } from '@/client/features/collab'
import { useWorkspaceLayoutCtx } from './WorkspaceLayoutContext'

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

export function useWorkspaceTabs() {
  const { workspaceId, layout, setLayout } = useWorkspaceLayoutCtx()
  const enabled = useCollabEnabled()
  const defaults = useMemo(() => normalizeWorkspaceTabs(layout.tabs), [layout.tabs])
  const [local, setLocal] = useState<WorkspaceTabsState>(() =>
    enabled ? readWorkspaceTabs(workspaceId, defaults) : defaults
  )
  const setTabs = useCallback(
    (tabs: WorkspaceTabsState) => {
      const next = normalizeWorkspaceTabs(tabs)
      if (enabled) {
        setLocal(next)
        writeWorkspaceTabs(workspaceId, next)
      } else {
        setLayout({ tabs: next })
      }
      return next
    },
    [enabled, setLayout, workspaceId]
  )
  return [enabled ? local : defaults, setTabs] as const
}
