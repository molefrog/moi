import { validateWorkspaceId } from './ids'
import type { WorkspaceLayout } from './types'

export type RemoteWorkspaceTarget = {
  user_id: string
  workspace_id: string
}

export type RemoteWorkspaceConfig = {
  version: 2
  remote: RemoteWorkspaceTarget
}

export type LocalWorkspaceConfig = WorkspaceLayout & { remote?: never }

export type WorkspaceFileConfig = LocalWorkspaceConfig | RemoteWorkspaceConfig

// Shared address format for workspace APIs, Cloud membership, and CLI operations.
export function workspaceAddress(id: string, userId?: string): string {
  return userId ? `${encodeURIComponent(userId)}:${encodeURIComponent(id)}` : encodeURIComponent(id)
}

export function workspaceApiBase(id: string, userId?: string): string {
  return `/api/workspaces/${workspaceAddress(id, userId)}`
}

export function parseRemoteWorkspaceTarget(value: unknown): RemoteWorkspaceTarget {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid remote workspace address')
  const target = value as Record<string, unknown>
  if (typeof target.user_id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(target.user_id))
    throw new Error('Invalid remote owner ID')
  if (typeof target.workspace_id !== 'string') throw new Error('Invalid remote workspace ID')
  const error = validateWorkspaceId(target.workspace_id)
  if (error) throw new Error(error)
  return { user_id: target.user_id, workspace_id: target.workspace_id }
}

export function parseRemoteWorkspaceConfig(value: Record<string, unknown>): RemoteWorkspaceConfig {
  if (value.version !== 2) throw new Error('Invalid remote workspace config')
  return { version: 2, remote: parseRemoteWorkspaceTarget(value.remote) }
}
