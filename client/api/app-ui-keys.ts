export const appUiKeys = {
  all: ['app-ui'] as const,
  // Collab: this browser tab's own chat choice per workspace tab.
  browserTabSelection: (workspaceId: string) =>
    ['app-ui', 'browser-tab-selection', workspaceId] as const
}
