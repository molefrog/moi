import { useEffect, useState } from 'react'

import { onWorkspaceEventsReconnect, useWorkspaceEvent } from '@/client/runtime/useWorkspaceEvents'
import { hasWebMcp, registerWebMcpTool } from '@/client/runtime/webmcp'
import { readToolDescriptors } from '@/lib/tool-execution'

export async function registerServerWebMcpTools(
  workspaceId: string,
  target: string,
  signal: AbortSignal,
  report: (message: string) => void
): Promise<() => void> {
  const cleanups: (() => void)[] = []
  const base = `/api/workspaces/${encodeURIComponent(workspaceId)}/tools/${encodeURIComponent(target)}`
  const response = await fetch(base, { signal })
  if (!response.ok) throw new Error(await response.text())
  const tools = readToolDescriptors(await response.json())
  if (signal.aborted) return () => {}
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
  return () => {
    for (const cleanup of cleanups) cleanup()
  }
}

export function useServerWebMcpTools(
  workspaceId: string,
  target: string | null,
  revision: string | undefined,
  report: (message: string) => void
) {
  const [refresh, setRefresh] = useState(0)
  useEffect(() => onWorkspaceEventsReconnect(() => setRefresh(value => value + 1)), [])
  useWorkspaceEvent(event => {
    if (event.type === 'env:updated' && event.workspaceId === workspaceId)
      setRefresh(value => value + 1)
  })
  useEffect(() => {
    if (!target || !hasWebMcp()) return
    const controller = new AbortController()
    let cleanup = () => {}
    void registerServerWebMcpTools(workspaceId, target, controller.signal, report)
      .then(dispose => {
        if (controller.signal.aborted) dispose()
        else cleanup = dispose
      })
      .catch(error => {
        if (!controller.signal.aborted) report(`Server tools: ${String(error)}`)
      })
    return () => {
      controller.abort()
      cleanup()
    }
  }, [workspaceId, target, revision, refresh, report])
}
