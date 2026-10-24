import { parse, stringify } from 'devalue'

import { callServerTool } from '../../../client/api/server-tools'

import { APPLET_API_BASE_SENTINEL } from '../api-base'
import type { JsonValue } from '../../../lib/tools'

type BrowserTool = {
  execute(args?: Record<string, unknown>, options?: { signal: AbortSignal }): Promise<JsonValue>
}

// Only proxies cross into browser bundles. Server handlers and secrets stay in
// the worker; metadata is available through the discovery endpoint.
export function toolProxy(viewId: string): Record<string, BrowserTool> {
  const cache = new Map<string, BrowserTool>()
  return new Proxy(Object.create(null) as Record<string, BrowserTool>, {
    get(_target, name) {
      if (typeof name !== 'string') return undefined
      if (!cache.has(name)) {
        cache.set(name, {
          execute: (args, options) =>
            callServerTool(APPLET_API_BASE_SENTINEL, `view:${viewId}`, name, args, options?.signal)
        })
      }
      return cache.get(name)
    }
  })
}

export function rpc(module: string, name: string) {
  return async (...args: unknown[]): Promise<unknown> => {
    const res = await fetch(APPLET_API_BASE_SENTINEL + '/rpc/' + module + '/' + name, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: stringify(args)
    })
    if (!res.ok) throw new Error(await res.text())
    return parse(await res.text())
  }
}
