export const workspaceKeys = {
  all: ['workspaces'] as const,
  discover: ['workspaces', 'discover'] as const,
  setupInfo: ['workspaces', 'setup-info'] as const,
  preview: (id: string) => ['workspaces', 'preview', id] as const,
  layout: (id: string) => ['workspaces', 'layout', id] as const,
  widgets: (id: string) => ['workspaces', 'widgets', id] as const,
  views: (id: string) => ['workspaces', 'views', id] as const,
  viewBuilders: (id: string) => ['workspaces', 'view-builders', id] as const,
  sessions: (id: string) => ['workspaces', 'sessions', id] as const,
  events: (id: string, sessionId: string) => ['workspaces', 'events', id, sessionId] as const,
  sessionConfig: (id: string, sessionId: string) =>
    ['workspaces', 'sessionConfig', id, sessionId] as const,
  mcp: (id: string) => ['workspaces', 'mcp', id] as const,
  agent: (id: string) => ['workspaces', 'agent', id] as const,
  skills: (id: string) => ['workspaces', 'skills', id] as const,
  env: (id: string) => ['workspaces', 'env', id] as const
}
