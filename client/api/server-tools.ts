import type { JsonValue, ToolDescriptor } from '@/lib/tools'

import { jsonRequest, requestJson } from './http'

function toolsUrl(apiBase: string, target: string) {
  return `${apiBase}/tools/${encodeURIComponent(target)}`
}

export function listServerTools(apiBase: string, target: string, signal?: AbortSignal) {
  return requestJson<ToolDescriptor[]>(toolsUrl(apiBase, target), { signal })
}

export function callServerTool(
  apiBase: string,
  target: string,
  name: string,
  args: Record<string, unknown> = {},
  signal?: AbortSignal
) {
  return requestJson<JsonValue>(`${toolsUrl(apiBase, target)}/${encodeURIComponent(name)}`, {
    ...jsonRequest('POST', args),
    signal
  })
}
