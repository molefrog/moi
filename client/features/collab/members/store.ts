import { isRemoteWorkspace } from '@/client/features/workspace/remote'
import { memberKeys } from './keys'
import { queryClient } from '@/client/api/query-client'
import { getIdentity, getAccountGeneration } from '../../identity/store'
import type { Identity } from '../../identity/types'
import { collabIdentityId, identityKey } from '../../identity/types'
import { normalizeUserProfile } from '../host-state'
import type { UserProfile } from '@/lib/collab/types'
import { parseWorkspaceMembers, validWorkspaceId } from './types'
import type { WorkspaceMembers, WorkspaceMembersSnapshot } from './types'

// Host-published memberships remain authoritative until replaced or cleared,
// including for workspaces that have no mounted React observer yet.
queryClient.setQueryDefaults(memberKeys.all, { gcTime: Infinity })

// Revisions track membership writes so older cloud snapshots cannot replace them.
let membersRevision = 0
let membersLoadedForAccountGeneration: number | undefined
const collectionListeners = new Set<() => void>()
const ownerSnapshots = new WeakMap<Identity, WorkspaceMembers>()
queryClient.getQueryCache().subscribe(event => {
  if (event.query.queryKey[0] !== memberKeys.all[0]) return
  if (event.type === 'removed' || (event.type === 'updated' && event.action.type === 'success')) {
    membersRevision++
  }
})
export const getWorkspaceMembersRevision = () => membersRevision
const directoryCache = new WeakMap<WorkspaceMembers, readonly UserProfile[]>()
// Cloud routing currently opens the owner's machine. No sharing record means
// owner-only; Moi's own workspace registry decides whether that workspace exists.
export function ownerOnlyWorkspaceMembers(): WorkspaceMembers | undefined {
  const owner = getIdentity()
  if (
    membersLoadedForAccountGeneration !== getAccountGeneration() ||
    owner?.type !== 'user' ||
    owner.isAnonymous
  )
    return undefined
  let snapshot = ownerSnapshots.get(owner)
  if (!snapshot) {
    snapshot = { members: [owner], invitations: [] }
    ownerSnapshots.set(owner, snapshot)
  }
  return snapshot
}
export function setWorkspaceMembers(workspaceId: string, value: WorkspaceMembers): void {
  const identity = getIdentity()
  const queryKey = memberKeys.workspace(identity ? identityKey(identity) : undefined, workspaceId)
  validWorkspaceId(workspaceId)
  const data = parseWorkspaceMembers(value)
  // A push supersedes any older in-flight GET for this snapshot.
  void queryClient.cancelQueries({ queryKey, exact: true })
  queryClient.setQueryData(queryKey, data)
}
export function setAllWorkspaceMembers(value: WorkspaceMembersSnapshot[]): void {
  if (!Array.isArray(value)) throw new Error('Invalid workspace members')
  const snapshots = value.map(workspace => ({
    id: validWorkspaceId(workspace.id),
    data: parseWorkspaceMembers(workspace)
  }))
  const ids = new Set(snapshots.map(workspace => workspace.id))
  if (ids.size !== snapshots.length) throw new Error('Duplicate workspace id')
  membersLoadedForAccountGeneration = getAccountGeneration()
  const identity = getIdentity()
  const accountId = identity ? identityKey(identity) : undefined
  const prefix = memberKeys.account(accountId)
  void queryClient.cancelQueries({ queryKey: prefix })
  for (const query of queryClient.getQueryCache().findAll({ queryKey: prefix })) {
    if (!isRemoteWorkspace(query.queryKey[2] as string) && !ids.has(query.queryKey[2] as string))
      forgetWorkspaceMembers(query.queryKey)
  }
  for (const workspace of snapshots)
    queryClient.setQueryData(memberKeys.workspace(accountId, workspace.id), workspace.data)
  membersRevision++
  collectionListeners.forEach(listener => listener())
}
export function removeWorkspaceMembers(workspaceId: string) {
  const identity = getIdentity()
  const queryKey = memberKeys.workspace(identity ? identityKey(identity) : undefined, workspaceId)
  validWorkspaceId(workspaceId)
  void queryClient.cancelQueries({ queryKey, exact: true })
  forgetWorkspaceMembers(queryKey)
}
export function clearWorkspaceMembers() {
  void queryClient.cancelQueries({ queryKey: memberKeys.all })
  for (const query of queryClient.getQueryCache().findAll({ queryKey: memberKeys.all }))
    forgetWorkspaceMembers(query.queryKey)
}
function forgetWorkspaceMembers(queryKey: readonly unknown[]) {
  // Removing an observed query leaves its current UI snapshot intact. Publish
  // the replacement so mounted views and the presence engine update together.
  queryClient.setQueryData<WorkspaceMembers>(
    queryKey,
    (!isRemoteWorkspace(queryKey[2] as string) ? ownerOnlyWorkspaceMembers() : undefined) ?? {
      members: [],
      invitations: []
    }
  )
}
export function getWorkspaceDirectory(workspaceId: string): readonly UserProfile[] | undefined {
  const identity = getIdentity()
  const queryKey = memberKeys.workspace(identity ? identityKey(identity) : undefined, workspaceId)
  const data =
    queryClient.getQueryData<WorkspaceMembers>(queryKey) ??
    (!isRemoteWorkspace(workspaceId) ? ownerOnlyWorkspaceMembers() : undefined)
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
    if (event.query.queryKey[0] === memberKeys.all[0]) listener()
  })
  return () => {
    collectionListeners.delete(listener)
    unsubscribe()
  }
}
