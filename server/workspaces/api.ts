import type { WorkspaceRef } from '../workspace-state'
import { loadWorkspaceFileConfig } from './layout'
import { PORT } from '../constants'
import { workspaceApiBase } from '@/lib/workspace-config'
import { remoteConfig } from '../remote/client'

// Use the same gateway and owner API as the browser. Authorization at the
// production gateway remains separate from the local mock transport.
export async function requestWorkspace(
  workspace: WorkspaceRef,
  path: string,
  init?: RequestInit
): Promise<Response> {
  const { remote } = await loadWorkspaceFileConfig(workspace.path)
  const base = remote ? (await remoteConfig()).url : `http://127.0.0.1:${PORT}`
  const url = new URL(
    workspaceApiBase(remote?.workspace_id ?? workspace.id, remote?.user_id) + path,
    base
  )
  const options: RequestInit = {
    ...init,
    redirect: 'error',
    signal: AbortSignal.timeout(30_000)
  }
  const response = remote
    ? await fetch(url, options)
    : await (await import('../api')).api.fetch(new Request(url, options))
  if (!response.ok)
    throw new Error(`Workspace request failed (${response.status}): ${await response.text()}`)
  return response
}
