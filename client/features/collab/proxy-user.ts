import type { ProxyUserState } from '@/lib/collab/types'

import { requestJson } from '@/client/api/http'
import { onWorkspaceEventsReconnect } from '@/client/runtime/useWorkspaceEvents'

import { setProxyUserState } from './host-state'

// GET /api/proxy-user: the viewer as verified by a proxy in front of moi, such as
// Cloudflare Access. A failed request keeps the current user.
async function fetchProxyUser(): Promise<void> {
  try {
    setProxyUserState(await requestJson<ProxyUserState>('/api/proxy-user'))
  } catch {}
}

// Loaded before the app mounts, like startup config, so workspaces choose
// between shared and browser-tab navigation with the inherited user already
// in place. A server restart can change the proxy config, so reconnects refetch.
export async function loadProxyUser(): Promise<void> {
  await fetchProxyUser()
  onWorkspaceEventsReconnect(() => {
    void fetchProxyUser()
  })
}
