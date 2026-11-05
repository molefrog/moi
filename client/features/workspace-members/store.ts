import { queryClient } from '@/client/api/query-client'
import { getIdentity, getIdentityGeneration } from '../identity/store'
import type { Identity } from '../identity/types'
import { collabIdentityId, identityKey } from '../identity/types'
import { normalizeUserProfile } from '../collab/host-state'
import type { UserProfile } from '@/lib/collab/types'
import { parseWorkspaceMembers, validWorkspaceId } from './types'
import type { WorkspaceMembers, WorkspaceMembersSnapshot } from './types'

export const workspaceMembersPrefix = ['workspace-members'] as const
export const workspaceMembersKey = (workspaceId: string) =>
  [
    ...workspaceMembersPrefix,
    getIdentity() ? identityKey(getIdentity()!) : 'unknown',
    workspaceId
  ] as const
const revisions = new Map<string, number>()
let revision = 0
let loadedGeneration: number | undefined
const collectionListeners = new Set<() => void>()
const ownerSnapshots = new WeakMap<Identity, WorkspaceMembers>()
queryClient.getQueryCache().subscribe(event => {
  if (event.query.queryKey[0] !== workspaceMembersPrefix[0]) return
  if (event.type === 'removed' || (event.type === 'updated' && event.action.type === 'success')) {
    const workspaceId = event.query.queryKey[2]
    if (typeof workspaceId === 'string') revisions.set(workspaceId, ++revision)
  }
})
export const getWorkspaceMembersRevision = (workspaceId?: string) =>
  workspaceId === undefined ? revision : (revisions.get(workspaceId) ?? 0)
const directoryCache = new WeakMap<WorkspaceMembers, readonly UserProfile[]>()
// Cloud routing currently opens the owner's machine. No sharing record means
// owner-only; Moi's own workspace registry decides whether that workspace exists.
export function ownerOnlyWorkspaceMembers(): WorkspaceMembers | undefined {
  const owner = getIdentity()
  if (loadedGeneration !== getIdentityGeneration() || owner?.type !== 'user' || owner.isAnonymous)
    return undefined
  let snapshot = ownerSnapshots.get(owner)
  if (!snapshot) {
    snapshot = { members: [owner], invitations: [] }
    ownerSnapshots.set(owner, snapshot)
  }
  return snapshot
}
export function setWorkspaceMembers(workspaceId: string, value: WorkspaceMembers): void {
  validWorkspaceId(workspaceId)
  const data = parseWorkspaceMembers(value)
  // A push supersedes any older in-flight GET for this snapshot.
  void queryClient.cancelQueries({ queryKey: workspaceMembersKey(workspaceId), exact: true })
  queryClient.setQueryData(workspaceMembersKey(workspaceId), data)
}
export function setAllWorkspaceMembers(value: WorkspaceMembersSnapshot[]): void {
  if (!Array.isArray(value)) throw new Error('Invalid workspace members')
  const snapshots = value.map(workspace => ({
    id: validWorkspaceId(workspace.id),
    data: parseWorkspaceMembers(workspace)
  }))
  const ids = new Set(snapshots.map(workspace => workspace.id))
  if (ids.size !== snapshots.length) throw new Error('Duplicate workspace id')
  loadedGeneration = getIdentityGeneration()
  const prefix = workspaceMembersKey('').slice(0, 2)
  void queryClient.cancelQueries({ queryKey: prefix })
  for (const query of queryClient.getQueryCache().findAll({ queryKey: prefix })) {
    if (!ids.has(query.queryKey[2] as string))
      queryClient.removeQueries({ queryKey: query.queryKey, exact: true })
  }
  for (const workspace of snapshots)
    queryClient.setQueryData(workspaceMembersKey(workspace.id), workspace.data)
  revision++
  collectionListeners.forEach(listener => listener())
}
export function removeWorkspaceMembers(workspaceId: string) {
  validWorkspaceId(workspaceId)
  void queryClient.cancelQueries({ queryKey: workspaceMembersKey(workspaceId), exact: true })
  queryClient.removeQueries({ queryKey: workspaceMembersKey(workspaceId), exact: true })
}
export function clearWorkspaceMembers() {
  void queryClient.cancelQueries({ queryKey: workspaceMembersPrefix })
  queryClient.removeQueries({ queryKey: workspaceMembersPrefix })
}
export function getWorkspaceDirectory(workspaceId: string): readonly UserProfile[] | undefined {
  const data =
    queryClient.getQueryData<WorkspaceMembers>(workspaceMembersKey(workspaceId)) ??
    ownerOnlyWorkspaceMembers()
  if (!data) return undefined
  let profiles = directoryCache.get(data)
  if (!profiles) {
    profiles = data.members.map(member =>
      normalizeUserProfile({
        id: collabIdentityId(member),
        name: member.name || undefined,
        avatar: member.avatar,
        email: member.type === 'user' ? member.email || undefined : undefined
      })
    )
    directoryCache.set(data, profiles)
  }
  return profiles
}
export function subscribeWorkspaceDirectory(listener: () => void) {
  collectionListeners.add(listener)
  const unsubscribe = queryClient.getQueryCache().subscribe(event => {
    if (event.query.queryKey[0] === workspaceMembersPrefix[0]) listener()
  })
  return () => {
    collectionListeners.delete(listener)
    unsubscribe()
  }
}
