import { useSyncExternalStore } from 'react'

import type { ClientAppConfig } from '@/lib/types'

import { onWorkspaceEventsReconnect } from '@/client/runtime/useWorkspaceEvents'

import { requestJson } from './http'

// Startup config (GET /api/config): frozen for the server process lifetime,
// so it is fetched once before the app mounts (see init() in index.tsx) and
// read synchronously everywhere after that — no query, no loading states.
// The one thing that can change it is a server restart; the events socket
// reconnecting is that signal, so the store re-fetches there.

const DEFAULTS: ClientAppConfig = {
  cloudDemo: false,
  experiments: [],
  demoInstallUrl: 'https://moi.computer'
}

let current: ClientAppConfig = DEFAULTS
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// Failures keep the last known value (defaults on the very first fetch):
// non-demo is the safe presentation, and the server still enforces its gates.
async function fetchAppConfig(): Promise<void> {
  try {
    current = await requestJson<ClientAppConfig>('/api/config')
    for (const listener of listeners) listener()
  } catch {}
}

// Called once from init() before the app mounts; never rejects, so a config
// hiccup cannot block the app from starting.
export async function loadAppConfig(): Promise<void> {
  await fetchAppConfig()
  onWorkspaceEventsReconnect(() => {
    void fetchAppConfig()
  })
}

export function useAppConfig(): ClientAppConfig {
  return useSyncExternalStore(subscribe, () => current)
}
