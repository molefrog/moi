// Newline JSON-RPC only. Workspace/process policy lives in client.ts; keeping
// framing separate lets tests exercise the same transport with in-memory pipes.
import { codexServerRequestResponse } from './permissions'

export type Json = Record<string, unknown>
export type NotificationListener = (method: string, params: Json) => void
export type RequestListener = (
  method: string,
  params: Json,
  id: string | number
) => Promise<Json | undefined> | undefined

export class CodexRpcError extends Error {
  constructor(
    message: string,
    readonly code: number,
    readonly data?: unknown
  ) {
    super(message)
    this.name = 'CodexRpcError'
  }
}

export type CodexTransport = {
  rpc: <T>(method: string, params?: Json) => Promise<T>
  notify: (method: string, params?: Json) => void
  onNotification: (listener: NotificationListener) => () => void
  onRequest: (listener: RequestListener) => () => void
  isAlive: () => boolean
  close: (error?: Error) => void
}

type TransportOptions = {
  stdout: ReadableStream<Uint8Array>
  write: (line: string) => void | Promise<void>
  stop: () => void
  tap?: (direction: 'send' | 'recv', frame: Json) => void
  timeoutMs?: number
}

export function createCodexTransport(options: TransportOptions): CodexTransport {
  let alive = true
  let nextId = 1
  const listeners = new Set<NotificationListener>()
  const requestListeners = new Set<RequestListener>()
  const pending = new Map<
    number,
    {
      resolve: (value: unknown) => void
      reject: (error: Error) => void
      timer: Timer
    }
  >()
  const reader = options.stdout.getReader()

  function fanout(method: string, params: Json) {
    for (const listener of listeners) {
      try {
        listener(method, params)
      } catch (error) {
        console.error('[codex] notification listener threw', error)
      }
    }
  }

  function close(
    error = new Error('Codex disconnected. Send another message to resume this chat.')
  ) {
    if (!alive) return
    alive = false
    for (const request of pending.values()) {
      clearTimeout(request.timer)
      request.reject(error)
    }
    pending.clear()
    fanout('__exit', { message: error.message })
    listeners.clear()
    requestListeners.clear()
    void reader.cancel().catch(() => {})
    try {
      options.stop()
    } catch {
      /* The process may already have exited. */
    }
  }

  function send(frame: Json, redact = false) {
    if (!alive) throw new Error('Codex app-server is not running')
    options.tap?.('send', redact ? { ...frame, result: '[user input]' } : frame)
    // Bun's flush can be asynchronous; observe failures instead of leaving an
    // unhandled rejection and waiting for every RPC to time out independently.
    try {
      const written = options.write(JSON.stringify(frame) + '\n')
      if (written)
        void written.catch(error =>
          close(error instanceof Error ? error : new Error(String(error)))
        )
    } catch (error) {
      close(error instanceof Error ? error : new Error(String(error)))
    }
  }

  function rpc<T>(method: string, params: Json = {}): Promise<T> {
    if (!alive) return Promise.reject(new Error('Codex app-server is not running'))
    const id = nextId++
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new Error(`Codex request timed out: ${method}`))
      }, options.timeoutMs ?? 30_000)
      // Register before writing: a synchronous response must find its waiter.
      pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timer })
      send({ jsonrpc: '2.0', id, method, params })
    })
  }

  function handleLine(line: string) {
    if (!line.trim()) return
    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch {
      return
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return
    const msg = parsed as Json
    options.tap?.('recv', msg)
    if (typeof msg.method === 'string') {
      const params =
        msg.params && typeof msg.params === 'object' && !Array.isArray(msg.params)
          ? (msg.params as Json)
          : {}
      if ('id' in msg) {
        if (typeof msg.id !== 'string' && typeof msg.id !== 'number') return
        for (const listener of requestListeners) {
          let response: Promise<Json | undefined> | undefined
          try {
            response = listener(msg.method, params, msg.id)
          } catch (error) {
            response = Promise.reject(error)
          }
          if (!response) continue
          const id = msg.id
          void response.then(
            result => {
              if (alive && result !== undefined) send({ jsonrpc: '2.0', id, result }, true)
            },
            error => {
              if (alive)
                send({
                  jsonrpc: '2.0',
                  id,
                  error: {
                    code: -32603,
                    message: error instanceof Error ? error.message : 'Input request failed'
                  }
                })
            }
          )
          return
        }
        send({ jsonrpc: '2.0', id: msg.id, ...codexServerRequestResponse(msg.method, params) })
      } else fanout(msg.method, params)
      return
    }
    if (typeof msg.id !== 'number') return
    const request = pending.get(msg.id)
    if (!request) return
    pending.delete(msg.id)
    clearTimeout(request.timer)
    if (msg.error && typeof msg.error === 'object') {
      const error = msg.error as Json
      request.reject(
        new CodexRpcError(
          typeof error.message === 'string' ? error.message : 'Codex request failed',
          typeof error.code === 'number' ? error.code : -32603,
          error.data
        )
      )
    } else request.resolve(msg.result)
  }

  void (async () => {
    const decoder = new TextDecoder()
    let buffer = ''
    try {
      while (alive) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let start = 0
        let end: number
        while ((end = buffer.indexOf('\n', start)) >= 0) {
          handleLine(buffer.slice(start, end))
          start = end + 1
        }
        buffer = buffer.slice(start)
      }
      if (alive) handleLine(buffer + decoder.decode())
    } catch (error) {
      close(error instanceof Error ? error : new Error(String(error)))
    } finally {
      close()
    }
  })()

  return {
    rpc,
    notify: (method, params = {}) => send({ jsonrpc: '2.0', method, params }),
    onNotification(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    onRequest(listener) {
      requestListeners.add(listener)
      return () => {
        requestListeners.delete(listener)
      }
    },
    isAlive: () => alive,
    close
  }
}
