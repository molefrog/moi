import type { WorkspaceLayout, WorkspaceTabsState } from './types'

export function createDefaultWorkspaceTabs(): WorkspaceTabsState {
  return { open: ['agent', 'widgets', 'scratchpad'], active: 'agent' }
}

export function createDefaultWorkspaceLayout(): WorkspaceLayout {
  return {
    version: 1,
    widgetGrid: [],
    layoutMode: 'split',
    tabs: createDefaultWorkspaceTabs()
  }
}
