import type { WorkspaceLayout, WorkspaceTabsState } from './types'

export function createDefaultWorkspaceTabs(): WorkspaceTabsState {
  return { open: ['agent', 'widgets'], active: 'agent' }
}

export function createDefaultWorkspaceLayout(): WorkspaceLayout {
  return {
    version: 1,
    widgetGrid: [],
    layoutMode: 'fullscreen',
    tabs: createDefaultWorkspaceTabs()
  }
}
