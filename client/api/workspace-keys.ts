export const workspaceKeys = {
  all: ['workspaces'] as const,
  discover: ['workspaces', 'discover'] as const,
  // Every workspace's home-card preview, fetched in one batch.
  previews: ['workspaces', 'previews'] as const,
  address: (id: string) => ['workspaces', 'address', id] as const,
  layout: (id: string) => ['workspaces', 'layout', id] as const,
  widgets: (id: string) => ['workspaces', 'widgets', id] as const,
  appletThumbnails: (id: string) => ['workspaces', 'applet-thumbnails', id] as const,
  views: (id: string) => ['workspaces', 'views', id] as const,
  sessions: (id: string) => ['workspaces', 'sessions', id] as const,
  events: (id: string, sessionId: string) => ['workspaces', 'events', id, sessionId] as const,
  // Per-user chat state (`GET /api/workspaces/:id/state`).
  state: (id: string) => ['workspaces', 'state', id] as const,
  mcp: (id: string) => ['workspaces', 'mcp', id] as const,
  harness: (id: string) => ['workspaces', 'harness', id] as const,
  skills: (id: string) => ['workspaces', 'skills', id] as const,
  env: (id: string) => ['workspaces', 'env', id] as const
}
