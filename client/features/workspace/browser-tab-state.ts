import { useCallback, useMemo, useState } from 'react'

import type { WorkspaceTabsState } from '@/lib/types'
import { normalizeWorkspaceTabs } from '@/lib/workspace-layout'
import { useAppConfig } from '@/client/api/app-config'
import { useWorkspaceLayoutCtx } from './workspace-layout-context'

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
  const cloud = useAppConfig().environment === 'cloud'
  const defaults = useMemo(() => normalizeWorkspaceTabs(layout.tabs), [layout.tabs])
  const [local, setLocal] = useState<WorkspaceTabsState>(() =>
    cloud ? readWorkspaceTabs(workspaceId, defaults) : defaults
  )
  const setTabs = useCallback(
    (tabs: WorkspaceTabsState) => {
      const next = normalizeWorkspaceTabs(tabs)
      if (cloud) {
        setLocal(next)
        writeWorkspaceTabs(workspaceId, next)
      } else {
        setLayout({ tabs: next })
      }
      return next
    },
    [cloud, setLayout, workspaceId]
  )
  return [cloud ? local : defaults, setTabs] as const
}
