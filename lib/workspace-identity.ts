import type { WorkspaceEntry } from './types'
import { workspaceApiBase, type RemoteWorkspaceTarget } from './workspace-config'

// A reversible pair key, not a new workspace ID. '~' cannot occur in local IDs.
export function workspaceIdentity(entry: Pick<WorkspaceEntry, 'id' | 'remote'>): string {
  if (!entry.remote) return entry.id
  const bytes = new TextEncoder().encode(
    JSON.stringify([entry.remote.user_id, entry.remote.workspace_id])
  )
  return `remote~${btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '')}`
}

export function remoteFromIdentity(key: string): RemoteWorkspaceTarget | undefined {
  if (!key.startsWith('remote~')) return undefined
  try {
    const bytes = Uint8Array.from(
      atob(key.slice(7).replaceAll('-', '+').replaceAll('_', '/')),
      char => char.charCodeAt(0)
    )
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes))
    if (
      !Array.isArray(value) ||
      value.length !== 2 ||
      value.some(id => typeof id !== 'string' || !id)
    )
      return undefined
    const target = { user_id: value[0] as string, workspace_id: value[1] as string }
    return workspaceIdentity({ id: target.workspace_id, remote: target }) === key
      ? target
      : undefined
  } catch {
    return undefined
  }
}

export function workspaceBase(id: string): string {
  const remote = remoteFromIdentity(id)
  return workspaceApiBase(remote?.workspace_id ?? id, remote?.user_id)
}
