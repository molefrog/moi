import { useCallback, useEffect, useRef } from 'react'

import { reportAppletError } from '@/client/features/applets/applet-log'
import {
  callViewTool,
  listViewTools,
  onViewToolsChanged
} from '@/client/features/applets/view-tools'
import {
  onWorkspaceConnection,
  sendWorkspaceMessage,
  useWorkspaceEvent
} from '@/client/runtime/useWorkspaceEvents'
import { useServerWebMcpTools } from '@/client/runtime/useServerWebMcpTools'
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

  const reportServerTools = useCallback(
    (message: string) => {
      if (activeViewId)
        reportAppletError(workspaceId, {
          source: 'runtime',
          kind: 'view',
          name: activeViewId,
          message
        })
    },
    [workspaceId, activeViewId]
  )
  useServerWebMcpTools(
    workspaceId,
    activeViewId ? `view:${activeViewId}` : null,
    revision,
    reportServerTools
  )
}
