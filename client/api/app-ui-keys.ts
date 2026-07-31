export const appUiKeys = {
  all: ['app-ui'] as const,
  selectedSession: (workspaceId: string) => ['app-ui', 'selected-session', workspaceId] as const
}
