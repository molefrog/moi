import { readToolDescriptors } from '@/lib/tool-execution'
import { isJsonValue, isRecord, type JsonValue, type ToolDescriptor } from '@/lib/tools'
import { VIEW_TOOL_TIMEOUT_MS } from '@/lib/view-tools'

type Socket = { send(data: string): unknown }
type Presence = { workspaceId: string; viewId: string; tools: ToolDescriptor[] }
type Pending = {
  socket: Socket
  finish: (error?: string, result?: JsonValue) => void
}

export function createViewToolRelay(timeoutMs = VIEW_TOOL_TIMEOUT_MS) {
  const clients = new Map<Socket, Presence>()
  const pending = new Map<string, Pending>()

  const matchesFor = (workspaceId: string, viewId: string) =>
    [...clients].filter(([, p]) => p.workspaceId === workspaceId && p.viewId === viewId)
  return {
    availability(workspaceId: string, viewId: string): 'available' | 'unavailable' | 'ambiguous' {
      const count = matchesFor(workspaceId, viewId).length
      return count === 0 ? 'unavailable' : count === 1 ? 'available' : 'ambiguous'
    },
    hasTool(workspaceId: string, viewId: string, name: string) {
      return matchesFor(workspaceId, viewId).some(([, p]) =>
        p.tools.some(tool => tool.name === name)
      )
    },
    list(workspaceId: string, viewId: string): ToolDescriptor[] {
      const matches = matchesFor(workspaceId, viewId)
      return matches.length === 1 ? matches[0][1].tools : []
    },
    message(socket: Socket, value: unknown) {
      if (!isRecord(value)) return
      if (value.type === 'view-tool:presence') {
        clients.delete(socket)
        if (typeof value.workspaceId !== 'string' || typeof value.viewId !== 'string') return
        try {
          clients.set(socket, {
            workspaceId: value.workspaceId,
            viewId: value.viewId,
            tools: readToolDescriptors(value.tools)
          })
        } catch {}
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
      const matches = matchesFor(workspaceId, viewId)
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
