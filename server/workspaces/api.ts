import { PORT } from '../constants'
import { workspaceApiBase } from '@/lib/workspace-config'
import { workspaceRequest } from '../remote/client'
import { getWorkspace } from './registry'

// Shared-content CLI commands use one API; config selects local handlers or the owner.
// Personal operations (tabs, skills, navigation) stay with their existing local handlers.
export async function requestWorkspace(
  workspace: { id: string },
  path: string,
  init?: RequestInit
): Promise<Response> {
  const remote = (await getWorkspace(workspace.id))?.remote
  if (remote) {
    // Serialize multipart bodies once so the signature and content type match the bytes sent.
    const payload = new Response(init?.body, { headers: init?.headers })
    return workspaceRequest(remote.user_id, remote.workspace_id, path, {
      method: init?.method,
      body: init?.body == null ? undefined : new Uint8Array(await payload.arrayBuffer()),
      signal: init?.signal ?? undefined,
      contentType: payload.headers.get('content-type') ?? undefined
    })
  }
  const { api } = await import('../api')
  const response = await api.fetch(
    new Request(`http://127.0.0.1:${PORT}${workspaceApiBase(workspace.id)}${path}`, init)
  )
  if (!response.ok)
    throw new Error(`Workspace request failed (${response.status}): ${await response.text()}`)
  return response
}
