export const appUiKeys = {
  all: ['app-ui'] as const,
  sessionSelection: (workspaceId: string) => ['app-ui', 'session-selection', workspaceId] as const
}
