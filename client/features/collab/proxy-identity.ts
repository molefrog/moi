import type { ProxyIdentity } from '@/lib/collab/types'

import { requestJson } from '@/client/api/http'
import { onWorkspaceEventsReconnect } from '@/client/runtime/useWorkspaceEvents'

import { setProxyIdentity } from './identity'

// GET /api/identity: the viewer as verified by a proxy in front of moi, such as
// Cloudflare Access. A failed request keeps the current identity.
async function fetchProxyIdentity(): Promise<void> {
  try {
    setProxyIdentity(await requestJson<ProxyIdentity>('/api/identity'))
  } catch {}
}

// Loaded before the app mounts, like startup config, so workspaces choose
// between shared and personal navigation with the inherited identity already
// in place. A server restart can change the proxy config, so reconnects refetch.
export async function loadProxyIdentity(): Promise<void> {
  await fetchProxyIdentity()
  onWorkspaceEventsReconnect(() => {
    void fetchProxyIdentity()
  })
}
