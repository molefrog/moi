import { useEffect, useState } from 'react'
import { reportAppletError } from '@/client/features/applets/applet-log'
import { registerViewTool, setServerToolCatalog } from '@/client/features/applets/view-tools'
import { onWorkspaceEventsReconnect, useWorkspaceEvent } from '@/client/runtime/useWorkspaceEvents'
import { readToolDescriptors } from '@/lib/tool-execution'

// Metadata lives with the resident slot. Native proxies are exposed while the
// view is visible, and call the same server tool endpoint regardless of other tabs.
export function useServerTools(
  workspaceId: string,
  viewId: string,
  revision: string | undefined,
  active: boolean
) {
  const [refresh, setRefresh] = useState(0)
  useEffect(() => onWorkspaceEventsReconnect(() => setRefresh(value => value + 1)), [])
  useWorkspaceEvent(event => {
    if (
      (event.type === 'view:updated' && event.name === viewId) ||
      event.type === 'applets:refresh' ||
      ((event.type === 'env:updated' || event.type === 'tools:updated') &&
        event.workspaceId === workspaceId)
    )
      setRefresh(value => value + 1)
  })
  useEffect(() => {
    const controller = new AbortController()
    const cleanups: (() => void)[] = []
    const base = `/api/workspaces/${encodeURIComponent(workspaceId)}/tools/${encodeURIComponent(viewId)}`
    const catalog = fetch(base, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error(await response.text())
      return readToolDescriptors(await response.json())
    })
    const clearCatalog = setServerToolCatalog(workspaceId, viewId, catalog)
    const report = (message: string) =>
      reportAppletError(workspaceId, { source: 'runtime', kind: 'view', name: viewId, message })
    void catalog
      .then(tools => {
        if (controller.signal.aborted || !active) return
        for (const tool of tools) {
          try {
            cleanups.push(
              registerViewTool(
                workspaceId,
                viewId,
                {
                  ...tool,
                  execute: async (args, { signal }) => {
                    const response = await fetch(`${base}/${encodeURIComponent(tool.name)}`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(args),
                      signal
                    })
                    if (!response.ok) throw new Error(await response.text())
                    return response.json()
                  }
                },
                report,
                'server'
              )
            )
          } catch (error) {
            report(error instanceof Error ? error.message : String(error))
          }
        }
      })
      .catch(error => {
        if (!controller.signal.aborted) report(`Server tools: ${String(error)}`)
      })
    return () => {
      controller.abort()
      for (const cleanup of cleanups) cleanup()
      clearCatalog()
    }
  }, [workspaceId, viewId, revision, active, refresh])
}
