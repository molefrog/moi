import type { McpServer } from '@/lib/types'
import type { CodexClient } from './client'
import { readCodexPages } from './pagination'

type InstalledApp = { id: string; enabled: boolean; callable: boolean }
type App = {
  id: string
  name: string
  logoUrl: string | null
  isAccessible: boolean
  isEnabled: boolean
}
type ConfigLayer = {
  name: { type: string }
  config: { mcp_servers?: Record<string, unknown> }
  disabledReason?: string | null
}

const customSources = new Set([
  'user',
  'project',
  'system',
  'mdm',
  'enterpriseManaged',
  'legacyManagedConfigTomlFromFile',
  'legacyManagedConfigTomlFromMdm'
])

export async function expandCodexApps(
  client: Pick<CodexClient, 'rpc'> & Partial<Pick<CodexClient, 'onNotification'>>,
  servers: McpServer[],
  sessionId?: string,
  workspacePath?: string,
  onProgress?: (connectors: McpServer[]) => void
): Promise<McpServer[]> {
  const context = sessionId ? { threadId: sessionId } : {}
  const config = await client.rpc<{ layers: ConfigLayer[] | null }>('config/read', {
    cwd: workspacePath,
    includeLayers: true
  })
  // Only explicit configuration belongs in the custom-server list. Runtime-injected
  // and packaged tools have no user/project/admin definition.
  const customNames = new Set(
    (config.layers ?? [])
      .filter(layer => !layer.disabledReason && customSources.has(layer.name.type))
      .flatMap(layer => Object.keys(layer.config.mcp_servers ?? {}))
  )
  const custom = servers.filter(
    server => server.name !== 'codex_apps' && customNames.has(server.name)
  )
  if (!servers.some(server => server.name === 'codex_apps')) return custom

  onProgress?.(custom)
  const installed = await client.rpc<{ apps: InstalledApp[] }>('app/installed', context)
  const runtime = new Map(installed.apps.map(app => [app.id, app]))
  const toConnectors = (apps: App[]): McpServer[] => [
    ...custom,
    ...apps.map((app): McpServer => {
      const state = runtime.get(app.id)
      return {
        name: `codex_apps/${app.id}`,
        displayName: app.name,
        iconUrl: app.logoUrl ? new URL(app.logoUrl, 'https://chatgpt.com').href : undefined,
        status: !(state?.enabled ?? app.isEnabled)
          ? 'disabled'
          : state?.callable
            ? 'connected'
            : 'pending'
      }
    })
  ]
  const progressApps = new Map<string, App>()
  const publish = (apps: App[]) => {
    for (const app of apps) if (app.isAccessible) progressApps.set(app.id, app)
    onProgress?.(toConnectors([...progressApps.values()]))
  }
  const unsubscribe = client.onNotification?.((method, params) => {
    if (method !== 'app/list/updated' || !Array.isArray(params.data)) return
    publish(params.data as App[])
  })
  try {
    const apps = await readCodexPages<App>(
      client,
      'app/list',
      { ...context, limit: 100 },
      { timeoutMs: 60_000, onPage: publish }
    )
    return toConnectors(apps.filter(app => app.isAccessible))
  } finally {
    unsubscribe?.()
  }
}
