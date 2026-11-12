import { resolve } from 'node:path'
import { fetchSharedWorkspaces } from './client'
import type { RemoteWorkspaceTarget } from '@/lib/workspace-config'
import {
  initializeRemoteWorkspaceConfig,
  loadWorkspaceFileConfig,
  unlinkRemoteWorkspaceConfig
} from '../workspaces/layout'
import { provisionWorkspace } from '../workspaces/init'
import { registerWorkspace } from '../workspaces/registry'
import { resolveWorkspaceRoot } from '../skills/version'

export async function currentRemoteWorkspace(path = process.cwd()) {
  const root = await resolveWorkspaceRoot(resolve(path))
  const config = await loadWorkspaceFileConfig(root)
  return config.remote ? { path: root, ...config.remote } : undefined
}
export async function linkRemoteWorkspace(path: string, target: RemoteWorkspaceTarget) {
  if (
    !/^[A-Za-z0-9_-]{1,64}$/.test(target.user_id) ||
    !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(target.workspace_id)
  )
    throw new Error('Invalid owner or workspace ID')
  const shares = await fetchSharedWorkspaces()
  if (!shares.some(w => w.id === target.workspace_id && w.owner.id === target.user_id))
    throw new Error('This workspace is not shared with this account')
  const root = await resolveWorkspaceRoot(resolve(path))
  const file = Bun.file(`${root}/.moi/.workspace.json`)
  if (await file.exists()) {
    const config = await loadWorkspaceFileConfig(root)
    if (
      !config.remote ||
      config.remote.user_id !== target.user_id ||
      config.remote.workspace_id !== target.workspace_id
    )
      throw new Error('This folder already has a different workspace configuration')
  } else await initializeRemoteWorkspaceConfig(root, target)
  await provisionWorkspace(root)
  const entry = await registerWorkspace(root)
  return { path: root, id: entry.id, ...target }
}
export async function unlinkRemoteWorkspace(path = process.cwd()) {
  const current = await currentRemoteWorkspace(path)
  if (!current) throw new Error('This folder is not linked to a remote workspace')
  await unlinkRemoteWorkspaceConfig(current.path)
  return current
}
