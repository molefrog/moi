import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { Mutex } from 'async-mutex'
import { fetchSharedWorkspaces } from '../remote/client'
import { createdWorkspacesRoot } from '../app-config'
import { workspaceIdFromName } from '@/lib/workspace-name'
import type { RemoteWorkspaceTarget } from '@/lib/workspace-config'
import { listWorkspaces, registerWorkspace } from './registry'
import { provisionWorkspace } from './init'
import { initializeRemoteWorkspaceConfig, loadWorkspaceFileConfig } from './layout'
import { publishEvent } from '../events'

const opening = new Mutex()
export async function openSharedWorkspace(remote: RemoteWorkspaceTarget) {
  const shares = await fetchSharedWorkspaces()
  if (!shares.some(share => share.id === remote.workspace_id && share.owner.id === remote.user_id))
    throw new Error('This workspace is no longer shared with you')
  return opening.runExclusive(async () => {
    const matches = (target?: RemoteWorkspaceTarget) =>
      target?.user_id === remote.user_id && target.workspace_id === remote.workspace_id
    const existing = (await listWorkspaces()).find(entry => matches(entry.remote))
    if (existing) return existing
    const hash = new Bun.CryptoHasher('sha256')
      .update(JSON.stringify([remote.user_id, remote.workspace_id]))
      .digest('hex')
      .slice(0, 12)
    const root = createdWorkspacesRoot()
    await mkdir(root, { recursive: true })
    const path = join(root, `shared-${workspaceIdFromName(remote.workspace_id)}-${hash}`)
    const created = await mkdir(path).then(
      () => true,
      (error: NodeJS.ErrnoException) => {
        if (error.code !== 'EEXIST') throw error
        return false
      }
    )
    if (created) {
      try {
        await initializeRemoteWorkspaceConfig(path, remote)
      } catch (error) {
        await rm(path, { recursive: true, force: true })
        throw error
      }
    } else if (!matches((await loadWorkspaceFileConfig(path)).remote)) {
      throw new Error('The shared workspace folder already contains different content')
    }
    await provisionWorkspace(path)
    const entry = await registerWorkspace(path)
    publishEvent({ type: 'workspaces-list:updated' })
    return entry
  })
}
