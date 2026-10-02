import { parse, stringify } from 'devalue'

import { APPLET_API_BASE_SENTINEL } from '../api-base'

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
