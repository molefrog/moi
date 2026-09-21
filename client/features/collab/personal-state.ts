import { useCallback, useState } from 'react'

import type { WorkspaceTabsState } from '@/lib/types'
import { normalizeWorkspaceTabs } from '@/lib/workspace-layout'

const keyFor = (workspaceId: string, field: string) => `moi:collab:${workspaceId}:${field}`

export function readPersonalSession(workspaceId: string): string | null {
  try {
    return sessionStorage.getItem(keyFor(workspaceId, 'session'))
  } catch {
    return null
  }
}

export function writePersonalSession(workspaceId: string, sessionId: string | null): void {
  try {
    if (sessionId === null) sessionStorage.removeItem(keyFor(workspaceId, 'session'))
    else sessionStorage.setItem(keyFor(workspaceId, 'session'), sessionId)
  } catch {
    /* A private browser can still keep the active query in memory. */
  }
}

export function readPersonalTabs(
  workspaceId: string,
  defaults: WorkspaceTabsState
): WorkspaceTabsState {
  try {
    const saved = sessionStorage.getItem(keyFor(workspaceId, 'tabs'))
    return saved ? normalizeWorkspaceTabs(JSON.parse(saved)) : defaults
  } catch {
    return defaults
  }
}

export function writePersonalTabs(workspaceId: string, tabs: WorkspaceTabsState): void {
  try {
    sessionStorage.setItem(keyFor(workspaceId, 'tabs'), JSON.stringify(tabs))
  } catch {
    // The hook retains its in-memory selection when browser storage is denied.
  }
}

export function usePersonalTabs(
  workspaceId: string,
  enabled: boolean,
  defaults: WorkspaceTabsState
) {
  const [local, setLocal] = useState<WorkspaceTabsState>(() =>
    enabled ? readPersonalTabs(workspaceId, defaults) : defaults
  )
  const setTabs = useCallback(
    (tabs: WorkspaceTabsState) => {
      setLocal(tabs)
      writePersonalTabs(workspaceId, tabs)
    },
    [workspaceId]
  )
  return [enabled ? local : defaults, setTabs] as const
}
