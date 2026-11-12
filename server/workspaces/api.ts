import { PORT } from '../constants'
import { workspaceApiBase, type RemoteWorkspaceTarget } from '@/lib/workspace-config'
import { fetchWorkspace } from '../remote/client'

// The owner's API for a remote workspace, reached through the gateway.
// Authorization at the production gateway remains separate from the local mock.
export async function requestOwner(
  remote: RemoteWorkspaceTarget,
  path: string,
  init?: RequestInit
): Promise<Response> {
  return fetchWorkspace(remote.user_id, remote.workspace_id, path, init)
}

// CLI commands use the same workspace API as the browser. That API forwards a
// remote workspace's requests to its owner, so callers never pick a destination.
export async function requestWorkspace(
  workspace: { id: string },
  path: string,
  init?: RequestInit
): Promise<Response> {
  const { api } = await import('../api')
  const response = await api.fetch(
    new Request(`http://127.0.0.1:${PORT}${workspaceApiBase(workspace.id)}${path}`, init)
  )
  if (!response.ok)
    throw new Error(`Workspace request failed (${response.status}): ${await response.text()}`)
  return response
}
