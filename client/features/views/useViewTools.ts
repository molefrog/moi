import { useCallback, useEffect, useRef, useState } from 'react'

import {
  abortable,
  callViewTool,
  listViewTools,
  viewToolNames,
  onViewToolsChanged
} from '@/client/features/applets/view-tools'
import { useLatestRef } from '@/client/lib/use-latest-ref'
import {
  onWorkspaceConnection,
  sendWorkspaceMessage,
  useWorkspaceEvent
} from '@/client/runtime/useWorkspaceEvents'
import { VIEW_TOOL_TIMEOUT_MS, type ViewToolRequest } from '@/lib/view-tools'

import { VIEW_RETENTION_MS, type ResidentView } from './view-residency'

type Operation = { viewId: string; controller: AbortController; ready: () => void }

// Lives above Activity: it can wake a resident view whose registration effects are parked.
export function useViewTools(workspaceId: string) {
  const residents = useRef(new Map<string, number | null>())
  const operations = useRef(new Map<string, Operation>())
  const [busyViews, setBusyViews] = useState<ReadonlySet<string>>(new Set())
  const workspaceRef = useLatestRef(workspaceId)
  const syncBusy = useCallback(() => {
    setBusyViews(new Set([...operations.current.values()].map(op => op.viewId)))
  }, [])
  const publish = useCallback(() => {
    sendWorkspaceMessage({
      type: 'view-tool:presence',
      workspaceId: workspaceRef.current,
      views: [...residents.current.keys()],
      tools: Object.fromEntries(
        [...residents.current.keys()].map(id => [id, viewToolNames(workspaceRef.current, id)])
      )
    })
  }, [workspaceRef])
  const updateResidents = useCallback(
    (views: ResidentView[]) => {
      residents.current = new Map(views.map(view => [view.id, view.releasedAt]))
      for (const op of operations.current.values()) {
        if (!residents.current.has(op.viewId)) op.controller.abort()
      }
      publish()
    },
    [publish]
  )
  const ready = useCallback((viewId: string) => {
    for (const op of operations.current.values()) if (op.viewId === viewId) op.ready()
  }, [])

  const cancelAll = useCallback(() => {
    for (const op of operations.current.values()) op.controller.abort()
  }, [])

  useEffect(() => {
    const unsubscribe = onWorkspaceConnection(publish, cancelAll)
    const unsubscribeTools = onViewToolsChanged(publish)
    publish()
    return () => {
      unsubscribe()
      unsubscribeTools()
      cancelAll()
      sendWorkspaceMessage({ type: 'view-tool:presence', workspaceId, views: [] })
    }
  }, [workspaceId, publish, cancelAll])

  async function execute(request: ViewToolRequest) {
    const { requestId, viewId } = request
    if (operations.current.has(requestId)) return
    const releasedAt = residents.current.get(viewId)
    if (
      releasedAt === undefined ||
      (releasedAt !== null && Date.now() - releasedAt >= VIEW_RETENTION_MS)
    ) {
      sendWorkspaceMessage({
        type: 'view-tool:result',
        requestId,
        error: `View unavailable. Open it with moi tab focus view:${viewId}.`
      })
      return
    }
    if ([...operations.current.values()].some(op => op.viewId === viewId)) {
      sendWorkspaceMessage({
        type: 'view-tool:result',
        requestId,
        error: `A tool is already running in view:${viewId}. Wait for it to finish.`
      })
      return
    }
    const controller = new AbortController()
    const mounted = new Promise<void>(resolve => {
      operations.current.set(requestId, { viewId, controller, ready: resolve })
    })
    const timer = setTimeout(() => controller.abort(), VIEW_TOOL_TIMEOUT_MS)
    syncBusy()
    try {
      await abortable(mounted, controller.signal)
      const result =
        request.type === 'view-tool:list'
          ? listViewTools(workspaceId, viewId)
          : await callViewTool(workspaceId, viewId, request.name, request.args, controller.signal)
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
      syncBusy()
    }
  }

  useWorkspaceEvent(event => {
    if (event.type === 'view-tool:cancel')
      operations.current.get(event.requestId)?.controller.abort()
    if (
      (event.type === 'view-tool:call' || event.type === 'view-tool:list') &&
      event.workspaceId === workspaceId
    )
      void execute(event)
  })

  return { busyViews, updateResidents, ready }
}
