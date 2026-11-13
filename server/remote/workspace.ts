import { resolve } from 'node:path'
import { fetchSharedWorkspaces } from './client'
import { parseRemoteWorkspaceTarget, type RemoteWorkspaceTarget } from '@/lib/workspace-config'
import { loadWorkspaceFileConfig, unlinkRemoteWorkspaceConfig } from '../workspaces/layout'
import { registerRemoteWorkspaceReference } from '../workspaces/shared'
import { listWorkspaces, removeWorkspace } from '../workspaces/registry'
import { resolveWorkspaceRoot } from '../skills/version'

export async function currentRemoteWorkspace(path = process.cwd()) {
  const root = await resolveWorkspaceRoot(resolve(path))
  const config = await loadWorkspaceFileConfig(root)
  return config.remote ? { path: root, ...config.remote } : undefined
}
export async function linkRemoteWorkspace(path: string, target: RemoteWorkspaceTarget) {
  target = parseRemoteWorkspaceTarget(target)
  const shares = await fetchSharedWorkspaces()
  if (!shares.some(w => w.id === target.workspace_id && w.owner.id === target.user_id))
    throw new Error('This workspace is not shared with this account')
  // Linking creates a workspace at the requested folder. An ancestor's
  // registration must not redirect this write into a different directory.
  const root = resolve(path)
  const existing = (await listWorkspaces()).find(
    workspace =>
      workspace.remote?.user_id === target.user_id &&
      workspace.remote.workspace_id === target.workspace_id &&
      resolve(workspace.path) !== root
  )
  if (existing)
    throw new Error(
      `This workspace is already linked at ${existing.path} — unlink that folder first`
    )
  const entry = await registerRemoteWorkspaceReference(root, target)
  return { path: root, id: entry.id, ...target }
}
export async function unlinkRemoteWorkspace(path = process.cwd()) {
  const current = await currentRemoteWorkspace(path)
  if (!current) throw new Error('This folder is not linked to a remote workspace')
  await unlinkRemoteWorkspaceConfig(current.path)
  // Without its reference the folder is no workspace; drop it from the list too.
  const entry = (await listWorkspaces()).find(workspace => resolve(workspace.path) === current.path)
  if (entry) await removeWorkspace(entry.id)
  return current
}
