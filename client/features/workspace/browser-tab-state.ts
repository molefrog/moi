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
  const { workspaceId, layout, setLayout, remote } = useWorkspaceLayoutCtx()
  const storeTabsInBrowser = useAppConfig().environment === 'cloud' && !remote
  const defaults = useMemo(() => normalizeWorkspaceTabs(layout.tabs), [layout.tabs])
  const [local, setLocal] = useState<WorkspaceTabsState>(() =>
    storeTabsInBrowser ? readWorkspaceTabs(workspaceId, defaults) : defaults
  )
  const setTabs = useCallback(
    (tabs: WorkspaceTabsState) => {
      const next = normalizeWorkspaceTabs(tabs)
      if (storeTabsInBrowser) {
        setLocal(next)
        writeWorkspaceTabs(workspaceId, next)
      } else {
        setLayout({ tabs: next })
      }
      return next
    },
    [storeTabsInBrowser, setLayout, workspaceId]
  )
  return [storeTabsInBrowser ? local : defaults, setTabs] as const
}
