import { useCallback, useEffect, useRef, useState } from 'react'

import { reportAppletError } from '@/client/features/applets/applet-log'
import {
  callViewTool,
  hasWebMcp,
  listViewTools,
  onViewToolsChanged,
  registerWebMcpTool
} from '@/client/features/applets/view-tools'
import {
  onWorkspaceConnection,
  onWorkspaceEventsReconnect,
  sendWorkspaceMessage,
  useWorkspaceEvent
} from '@/client/runtime/useWorkspaceEvents'
import { readToolDescriptors } from '@/lib/tool-execution'
import { VIEW_TOOL_TIMEOUT_MS, type ViewToolRequest } from '@/lib/view-tools'

// The CLI relay mirrors WebMCP's natural lifetime: only the visible view
// publishes UI tools, and parking that view makes them unavailable.
export function useViewTools(
  workspaceId: string,
  activeViewId: string | null,
  revision: string | undefined
) {
  const operations = useRef(new Map<string, AbortController>())
  const publish = useCallback(() => {
    const tools = activeViewId ? listViewTools(workspaceId, activeViewId) : []
    sendWorkspaceMessage({
      type: 'view-tool:presence',
      workspaceId,
      viewId: activeViewId,
      tools
    })
  }, [workspaceId, activeViewId])
  const cancelAll = useCallback(() => {
    for (const controller of operations.current.values()) controller.abort()
  }, [])

  useEffect(() => {
    const unsubscribe = onWorkspaceConnection(publish, cancelAll)
    const unsubscribeTools = onViewToolsChanged(publish)
    publish()
    return () => {
      unsubscribe()
      unsubscribeTools()
      cancelAll()
      sendWorkspaceMessage({ type: 'view-tool:presence', workspaceId, viewId: null, tools: [] })
    }
  }, [workspaceId, publish, cancelAll])

  async function execute(request: ViewToolRequest) {
    const { requestId, viewId } = request
    if (operations.current.has(requestId)) return
    if (viewId !== activeViewId) {
      sendWorkspaceMessage({
        type: 'view-tool:result',
        requestId,
        error: `View unavailable. Open it with moi tab focus view:${viewId}.`
      })
      return
    }
    const controller = new AbortController()
    operations.current.set(requestId, controller)
    const timer = setTimeout(() => controller.abort(), VIEW_TOOL_TIMEOUT_MS)
    try {
      const result = await callViewTool(
        workspaceId,
        viewId,
        request.name,
        request.args,
        controller.signal
      )
      sendWorkspaceMessage({ type: 'view-tool:result', requestId, result })
    } catch (error) {
      sendWorkspaceMessage({
        type: 'view-tool:result',
        requestId,
        error: error instanceof Error ? error.message : String(error)
      })
    } finally {
      clearTimeout(timer)
      operations.current.delete(requestId)
    }
  }

  useWorkspaceEvent(event => {
    if (event.type === 'view-tool:cancel') operations.current.get(event.requestId)?.abort()
    if (event.type === 'view-tool:call' && event.workspaceId === workspaceId) void execute(event)
  })

  useServerWebMcpTools(workspaceId, activeViewId, revision)
}

function useServerWebMcpTools(
  workspaceId: string,
  viewId: string | null,
  revision: string | undefined
) {
  const [refresh, setRefresh] = useState(0)
  useEffect(() => onWorkspaceEventsReconnect(() => setRefresh(value => value + 1)), [])
  useWorkspaceEvent(event => {
    if (event.type === 'env:updated' && event.workspaceId === workspaceId)
      setRefresh(value => value + 1)
  })
  useEffect(() => {
    if (!viewId || !hasWebMcp()) return
    const controller = new AbortController()
    const cleanups: (() => void)[] = []
    const base = `/api/workspaces/${encodeURIComponent(workspaceId)}/tools/${encodeURIComponent(viewId)}`
    const report = (message: string) =>
      reportAppletError(workspaceId, { source: 'runtime', kind: 'view', name: viewId, message })
    void fetch(base, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error(await response.text())
        return readToolDescriptors(await response.json())
      })
      .then(tools => {
        if (controller.signal.aborted) return
        for (const tool of tools)
          cleanups.push(
            registerWebMcpTool(
              {
                ...tool,
                execute: async (args, options) => {
                  const response = await fetch(`${base}/${encodeURIComponent(tool.name)}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(args),
                    signal: options?.signal
                  })
                  if (!response.ok) throw new Error(await response.text())
                  return response.json()
                }
              },
              report
            )
          )
      })
      .catch(error => {
        if (!controller.signal.aborted) report(`Server tools: ${String(error)}`)
      })
    return () => {
      controller.abort()
      for (const cleanup of cleanups) cleanup()
    }
  }, [workspaceId, viewId, revision, refresh])
}
