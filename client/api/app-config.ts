import { useSyncExternalStore } from 'react'

import type { ClientAppConfig } from '@/lib/types'
import { EXPERIMENTAL_DEFAULTS } from '@/lib/experimental'

import { requestJson } from './http'

// Startup config (GET /api/config): frozen for the server process lifetime,
// so it is fetched once before the app mounts (see init() in index.tsx) and
// read synchronously everywhere after that — no query, no loading states.
// Only a server restart can change it, and a restart is picked up on the next
// page load.

const DEFAULTS: ClientAppConfig = {
  environment: 'local',
  demo: false,
  experimental: { ...EXPERIMENTAL_DEFAULTS },
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
async function fetchAppConfig(): Promise<ClientAppConfig | undefined> {
  try {
    current = await requestJson<ClientAppConfig>('/api/config')
    for (const listener of listeners) listener()
    return current
  } catch {}
}

// Called once from init() before the app mounts; never rejects, so a config
// hiccup cannot block the app from starting.
export async function loadAppConfig(): Promise<ClientAppConfig | undefined> {
  return fetchAppConfig()
}

export function useAppConfig(): ClientAppConfig {
  return useSyncExternalStore(subscribe, () => current)
}
