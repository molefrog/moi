import { isJsonValue, isRecord, VIEW_TOOL_TIMEOUT_MS, type JsonValue } from '@/lib/view-tools'

type Socket = { send(data: string): unknown }
type Presence = { workspaceId: string; views: string[] }
type Pending = {
  socket: Socket
  finish: (error?: string, result?: JsonValue) => void
}

export function createViewToolRelay(timeoutMs = VIEW_TOOL_TIMEOUT_MS) {
  const clients = new Map<Socket, Presence>()
  const pending = new Map<string, Pending>()

  return {
    message(socket: Socket, value: unknown) {
      if (!isRecord(value)) return
      if (value.type === 'view-tool:presence') {
        if (typeof value.workspaceId !== 'string' || !Array.isArray(value.views)) return
        if (!value.views.every(id => typeof id === 'string')) return
        clients.set(socket, { workspaceId: value.workspaceId, views: value.views })
      }
      if (value.type === 'view-tool:result' && typeof value.requestId === 'string') {
        const op = pending.get(value.requestId)
        if (!op || op.socket !== socket) return
        if (typeof value.error === 'string') op.finish(value.error)
        else if (isJsonValue(value.result)) op.finish(undefined, value.result)
        else op.finish('Tool returned a non-JSON result.')
      }
    },
    disconnect(socket: Socket) {
      clients.delete(socket)
      for (const op of pending.values()) {
        if (op.socket === socket)
          op.finish(
            'Browser disconnected. The tool may already have changed state; do not retry automatically.'
          )
      }
    },
    call(
      workspaceId: string,
      viewId: string,
      name: string,
      args: Record<string, unknown>,
      signal?: AbortSignal
    ): Promise<JsonValue> {
      const matches = [...clients].filter(
        ([, p]) => p.workspaceId === workspaceId && p.views.includes(viewId)
      )
      if (!matches.length)
        return Promise.reject(
          new Error(`View unavailable. Open it with moi tab focus view:${viewId}.`)
        )
      if (matches.length > 1)
        return Promise.reject(
          new Error(
            `view:${viewId} is available in multiple browser clients. Leave it open in only one client before calling a tool.`
          )
        )
      const socket = matches[0][0]
      const requestId = crypto.randomUUID()
      return new Promise((resolve, reject) => {
        const cancel = () => {
          try {
            socket.send(JSON.stringify({ type: 'view-tool:cancel', requestId }))
          } catch {
            /* already disconnected */
          } finally {
            finish(
              'Tool call cancelled or timed out. State may already have changed; do not retry automatically.'
            )
          }
        }
        const timer = setTimeout(cancel, timeoutMs)
        const finish = (error?: string, result?: JsonValue) => {
          if (!pending.delete(requestId)) return
          clearTimeout(timer)
          signal?.removeEventListener('abort', cancel)
          if (error) reject(new Error(error))
          else resolve(result ?? null)
        }
        pending.set(requestId, { socket, finish })
        signal?.addEventListener('abort', cancel, { once: true })
        if (signal?.aborted) return cancel()
        try {
          socket.send(
            JSON.stringify({ type: 'view-tool:call', requestId, workspaceId, viewId, name, args })
          )
        } catch {
          finish('Browser disconnected before the tool could be dispatched.')
        }
      })
    }
  }
}

export const viewToolRelay = createViewToolRelay()
