import { normalizeWorkspaceTabs } from './workspace-layout'
import { isSpeedMode } from './speed-mode'
import type { LayoutMode, SpeedMode, WorkspaceLayout, WorkspaceTabsState } from './types'

export type WorkspacePersonalConfig = {
  tabs?: WorkspaceTabsState
  layoutMode?: LayoutMode
  selectedModel?: string
  selectedEffort?: string
  selectedSpeedMode?: SpeedMode
}

export type RemoteWorkspaceTarget = {
  user_id: string
  workspace_id: string
}

export type RemoteWorkspaceConfig = WorkspacePersonalConfig & {
  version: 2
  remote: RemoteWorkspaceTarget
}

export type LocalWorkspaceConfig = Omit<WorkspaceLayout, 'version' | 'layoutMode'> &
  WorkspacePersonalConfig & { version: 2; remote?: never }

export type WorkspaceFileConfig = LocalWorkspaceConfig | RemoteWorkspaceConfig

export function workspaceApiBase(id: string, userId?: string): string {
  return userId
    ? `/api/remote/${encodeURIComponent(userId)}/workspaces/${encodeURIComponent(id)}`
    : `/api/workspaces/${encodeURIComponent(id)}`
}

export function personalWorkspaceConfig(value: Record<string, unknown>): WorkspacePersonalConfig {
  return {
    ...(value.tabs !== undefined && { tabs: normalizeWorkspaceTabs(value.tabs) }),
    layoutMode: value.layoutMode === 'fullscreen' ? 'fullscreen' : 'split',
    ...(typeof value.selectedModel === 'string' && { selectedModel: value.selectedModel }),
    ...(typeof value.selectedEffort === 'string' && { selectedEffort: value.selectedEffort }),
    ...(isSpeedMode(value.selectedSpeedMode) && { selectedSpeedMode: value.selectedSpeedMode })
  }
}

export function parseRemoteWorkspaceConfig(value: Record<string, unknown>): RemoteWorkspaceConfig {
  const remote = value.remote
  if (value.version !== 2 || !remote || typeof remote !== 'object' || Array.isArray(remote))
    throw new Error('Invalid remote workspace config')
  const target = remote as Record<string, unknown>
  const validId = (id: unknown): id is string =>
    typeof id === 'string' &&
    id.trim().length > 0 &&
    !Array.from(id).some(char => char === '/' || char === '\\' || char.charCodeAt(0) < 32) &&
    id !== '.' &&
    id !== '..'
  if (!validId(target.user_id) || !validId(target.workspace_id))
    throw new Error('Remote workspace requires valid user_id and workspace_id')
  return {
    version: 2,
    remote: { user_id: target.user_id, workspace_id: target.workspace_id },
    ...personalWorkspaceConfig(value)
  }
}
