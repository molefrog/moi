import { setIdentity, getIdentityRevision } from './store'
import {
  setWorkspaceMembers,
  setAllWorkspaceMembers,
  removeWorkspaceMembers,
  clearWorkspaceMembers,
  getWorkspaceMembersRevision
} from '../workspace-members/store'
import type { Identity } from './types'
import type { WorkspaceMembers, WorkspaceMembersSnapshot } from '../workspace-members/types'

export type IdentityHostApi = {
  identity: { set: (identity: Identity | null) => void; getRevision: () => number }
  workspaceMembers: {
    set: (workspaceId: string, data: WorkspaceMembers) => void
    setAll: (workspaces: WorkspaceMembersSnapshot[]) => void
    remove: (workspaceId: string) => void
    clear: () => void
    getRevision: () => number
  }
}
export function installIdentityHostApi() {
  if (typeof window === 'undefined') return
  const host = window as Window & { moi?: Partial<IdentityHostApi> & Record<string, unknown> }
  host.moi ??= {}
  host.moi.identity = { set: setIdentity, getRevision: getIdentityRevision }
  host.moi.workspaceMembers = {
    set: setWorkspaceMembers,
    setAll: setAllWorkspaceMembers,
    remove: removeWorkspaceMembers,
    clear: clearWorkspaceMembers,
    getRevision: getWorkspaceMembersRevision
  }
}
