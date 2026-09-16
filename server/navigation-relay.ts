import type { NavigationRequest } from '@/lib/navigation'
import { isParamsRecord } from '@/lib/workspace-tabs'

type NavigationClient = { send: (data: string) => unknown }
type Presence = { workspaceId: string | null; focusOrder: number }
type Pending = {
  client: NavigationClient
  workspaceId: string
  resolve: () => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

// One registry on the existing events socket. Server arrival order avoids
// client clock skew; blur deliberately retains the last focus for terminal use.
export function createNavigationRelay(timeoutMs = 5000) {
  const clients = new Map<NavigationClient, Presence>()
  const pending = new Map<string, Pending>()
  let focusOrder = 0

  function finish(id: string, error?: string) {
    const request = pending.get(id)
    if (!request) return
    clearTimeout(request.timer)
    pending.delete(id)
    if (error) request.reject(new Error(error))
    else request.resolve()
  }

  function remove(client: NavigationClient) {
    clients.delete(client)
    for (const [id, request] of pending) {
      if (request.client === client)
        finish(id, 'The browser disconnected before acknowledging navigation.')
    }
  }

  function receive(client: NavigationClient, data: unknown) {
    if (!isParamsRecord(data)) return
    if (
      data.type === 'navigation:presence' &&
      (typeof data.workspaceId === 'string' || data.workspaceId === null) &&
      typeof data.focused === 'boolean'
    ) {
      const previous = clients.get(client)
      const workspaceId = data.workspaceId as string | null
      clients.set(client, {
        workspaceId,
        focusOrder: data.focused
          ? ++focusOrder
          : previous?.workspaceId === workspaceId
            ? previous.focusOrder
            : 0
      })
      for (const [id, request] of pending) {
        if (request.client === client && request.workspaceId !== workspaceId)
          finish(id, 'The browser switched workspaces before acknowledging navigation.')
      }
    } else if (data.type === 'navigation:result' && typeof data.requestId === 'string') {
      const request = pending.get(data.requestId)
      if (!request || request.client !== client) return
      if (typeof data.error === 'string') finish(data.requestId, data.error)
      else if (data.ok === true) finish(data.requestId)
    }
  }

  function navigate(workspaceId: string, href: string): Promise<void> {
    const matching = [...clients].filter(([, presence]) => presence.workspaceId === workspaceId)
    matching.sort((a, b) => b[1].focusOrder - a[1].focusOrder)
    if (!matching.length)
      return Promise.reject(
        new Error('No browser is showing this workspace. Open it in moi and try again.')
      )
    if (matching.length > 1 && matching[0][1].focusOrder === 0) {
      return Promise.reject(
        new Error(
          'Several browsers show this workspace. Focus the one to navigate, then try again.'
        )
      )
    }
    const client = matching[0][0]
    const requestId = crypto.randomUUID()
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () =>
          finish(
            requestId,
            'Navigation acknowledgement timed out. Check the browser before retrying.'
          ),
        timeoutMs
      )
      pending.set(requestId, { client, workspaceId, resolve, reject, timer })
      const request: NavigationRequest = {
        type: 'navigation:request',
        requestId,
        workspaceId,
        href
      }
      try {
        client.send(JSON.stringify(request))
      } catch {
        finish(requestId, 'Could not send navigation to the browser.')
      }
    })
  }

  return { receive, remove, navigate }
}

export const navigationRelay = createNavigationRelay()
