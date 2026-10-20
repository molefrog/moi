import type { ProxyUserState } from '@/lib/collab/types'

import { requestJson } from '@/client/api/http'

import { setProxyUserState } from './host-state'

// GET /api/proxy-user: the viewer as verified by a proxy in front of moi, such as
// Cloudflare Access. A failed request keeps the current user.
async function fetchProxyUser(): Promise<ProxyUserState | undefined> {
  try {
    const state = await requestJson<ProxyUserState>('/api/proxy-user')
    if (
      !state ||
      typeof state !== 'object' ||
      Array.isArray(state) ||
      (state.provider !== undefined && state.provider !== 'cloudflare-access') ||
      (state.provider === undefined && state.profile !== undefined)
    )
      return undefined
    setProxyUserState(state)
    return state
  } catch {}
}

// Loaded once before the app mounts, like startup config, so workspaces
// choose between shared and browser-tab navigation with the inherited user
// already in place.
export async function loadProxyUser(): Promise<ProxyUserState | undefined> {
  return fetchProxyUser()
}
