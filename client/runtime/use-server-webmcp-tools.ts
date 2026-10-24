import { useEffect, useState } from 'react'

import { callServerTool, listServerTools } from '@/client/api/server-tools'
import type { Tool } from '@/lib/tools'

import { useAppContext } from './app-context'
import { useWorkspaceEvent } from './use-workspace-events'

type ModelContext = {
  registerTool: (tool: Tool, options: { signal: AbortSignal }) => Promise<void> | void
}

export function useServerWebMcpTools(
  workspaceId: string,
  target: string | null,
  revision: string | undefined,
  report: (message: string) => void
) {
  const events = useAppContext()?.events
  const [refresh, setRefresh] = useState(0)
  useEffect(() => events?.onReconnect(() => setRefresh(value => value + 1)), [events])
  useWorkspaceEvent(event => {
    if (event.type === 'env:updated' && event.workspaceId === workspaceId)
      setRefresh(value => value + 1)
  })
  useEffect(() => {
    const context = (document as Document & { modelContext?: ModelContext }).modelContext
    if (!target || !context?.registerTool) return
    // Discovery and every registration belong to this active catalog. A single
    // abort removes them all, including registrations still in progress.
    const controller = new AbortController()
    const { signal } = controller
    const apiBase = `/api/workspaces/${encodeURIComponent(workspaceId)}`
    const register = async () => {
      const tools = await listServerTools(apiBase, target, signal)
      if (signal.aborted) return
      await Promise.all(
        tools.map(tool =>
          context.registerTool(
            {
              ...tool,
              execute: (args, options) =>
                callServerTool(apiBase, target, tool.name, args, options?.signal)
            },
            { signal }
          )
        )
      )
    }
    void register().catch(error => {
      if (signal.aborted) return
      controller.abort()
      report(`Server tools: ${String(error)}`)
    })
    return () => controller.abort()
  }, [workspaceId, target, revision, refresh, report])
}
