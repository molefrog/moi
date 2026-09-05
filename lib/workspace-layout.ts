import { createDefaultWidgetGrid } from './default-widgets'
import type { WorkspaceLayout, WorkspaceTabsState } from './types'
import { isWorkspaceTabId } from './workspace-tabs'

export function createDefaultWorkspaceTabs(): WorkspaceTabsState {
  return { open: ['overview', 'agent', 'scratchpad'], active: 'overview' }
}

export function normalizeWorkspaceTabs(value: unknown): WorkspaceTabsState {
  const defaults = createDefaultWorkspaceTabs()
  if (!value || typeof value !== 'object') return defaults

  const raw = value as Record<string, unknown>
  const savedOpen = Array.isArray(raw.open)
    ? raw.open.filter(isWorkspaceTabId).filter((tab, index, all) => all.indexOf(tab) === index)
    : []
  if (savedOpen.length === 0) return defaults

  const open = [
    'overview',
    ...savedOpen.filter(tab => tab !== 'overview')
  ] satisfies WorkspaceTabsState['open']
  const active = isWorkspaceTabId(raw.active) && open.includes(raw.active) ? raw.active : 'overview'
  return { open, active }
}

export function createDefaultWorkspaceLayout(): WorkspaceLayout {
  return {
    version: 1,
    widgetGrid: createDefaultWidgetGrid(),
    layoutMode: 'split',
    tabs: createDefaultWorkspaceTabs()
  }
}
