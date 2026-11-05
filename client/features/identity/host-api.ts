import { setIdentity, getIdentityVersion } from './store'
import {
  setWorkspaceMembers,
  removeWorkspaceMembers,
  clearWorkspaceMembers,
  getWorkspaceMembersRevision
} from '../workspace-members/store'
import type { Identity } from './types'
import type { WorkspaceMembers } from '../workspace-members/types'

export type IdentityHostApi = {
  identity: { set: (identity: Identity | null) => void; getRevision: () => number }
  workspaceMembers: {
    set: (workspaceId: string, data: WorkspaceMembers) => void
    remove: (workspaceId: string) => void
    clear: () => void
    getRevision: (workspaceId: string) => number
  }
}
export function installIdentityHostApi() {
  if (typeof window === 'undefined') return
  const host = window as Window & { moi?: Partial<IdentityHostApi> & Record<string, unknown> }
  host.moi ??= {}
  host.moi.identity = { set: setIdentity, getRevision: getIdentityVersion }
  host.moi.workspaceMembers = {
    set: setWorkspaceMembers,
    remove: removeWorkspaceMembers,
    clear: clearWorkspaceMembers,
    getRevision: getWorkspaceMembersRevision
  }
}

export function consumeCloudBootstrap() {
  if (typeof window === 'undefined') return
  const host = window as Window & {
    __MOI_CLOUD_BOOTSTRAP__?: {
      identity: Identity
      workspace?: { id: string; data: WorkspaceMembers }
    }
  }
  const bootstrap = host.__MOI_CLOUD_BOOTSTRAP__
  if (!bootstrap) return
  setIdentity(bootstrap.identity)
  if (bootstrap.workspace) setWorkspaceMembers(bootstrap.workspace.id, bootstrap.workspace.data)
  delete host.__MOI_CLOUD_BOOTSTRAP__
}
