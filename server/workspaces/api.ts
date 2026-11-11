import { PORT } from '../constants'
import { workspaceApiBase, type RemoteWorkspaceTarget } from '@/lib/workspace-config'
import { remoteConfig } from '../remote/client'

// The owner's API for a remote workspace, reached through the gateway.
// Authorization at the production gateway remains separate from the local mock.
export async function requestOwner(
  remote: RemoteWorkspaceTarget,
  path: string,
  init?: RequestInit
): Promise<Response> {
  const url = new URL(
    workspaceApiBase(remote.workspace_id, remote.user_id) + path,
    (await remoteConfig()).url
  )
  return fetch(url, { signal: AbortSignal.timeout(30_000), ...init, redirect: 'error' })
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
