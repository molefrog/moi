import { useIdentity } from '../identity/use-identity'
import { createContext, useContext, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAppConfig } from '@/client/api/app-config'
import {
  getCurrentUser,
  getCurrentUserSource,
  setLocalUser,
  subscribeCurrentUserStore
} from '@/client/features/collab/host-state'
import { getIdentity, setIdentity, getIdentityGeneration } from '../identity/store'
import { isAvatar, identityKey } from '../identity/types'
import { workspaceMembersPrefix } from '../workspace-members/store'
import { accountKeys, identityQuery, updateCloudProfile, signOutCloud } from './api'
import type { ProfilePatch } from './api'

function useAccountState() {
  const { environment, demo } = useAppConfig()
  const cloud = environment === 'cloud'
  const profile = useSyncExternalStore(subscribeCurrentUserStore, getCurrentUser, getCurrentUser)
  const source = useSyncExternalStore(
    subscribeCurrentUserStore,
    getCurrentUserSource,
    getCurrentUserSource
  )
  const identity = useIdentity()
  const qc = useQueryClient()
  const query = useQuery({ ...identityQuery, enabled: cloud && !demo })
  const registered = cloud && !demo && identity?.type === 'user' && !identity.isAnonymous
  const signOut = useMutation({
    mutationFn: signOutCloud,
    onSuccess: async () => {
      await qc.cancelQueries({ queryKey: accountKeys.all })
      setIdentity(null)
      qc.setQueryData(accountKeys.identity, null)
      window.location.assign('/cloud/login')
    }
  })
  async function saveProfile(patch: ProfilePatch) {
    const before = getIdentity()
    const generation = getIdentityGeneration()
    if (!before || before.type !== 'user' || before.isAnonymous)
      throw new Error('Sign in to change your profile')
    await updateCloudProfile(patch)
    const current = getIdentity()
    if (
      generation !== getIdentityGeneration() ||
      !current ||
      current.type !== 'user' ||
      current.id !== before.id
    )
      throw new Error('Your account changed. Reload Moi to try again.')
    // A newer server-pushed value wins. Apply only fields still equal to their original value.
    setIdentity({
      ...current,
      ...(patch.name !== undefined && current.name === before.name ? { name: patch.name } : {}),
      ...(patch.avatar !== undefined && current.avatar === before.avatar
        ? { avatar: patch.avatar ?? undefined }
        : {})
    })
    // Our identity write can supersede the event bridge's in-flight snapshot.
    // Refresh active lists now and mark inactive lists stale for their next mount.
    if (generation === getIdentityGeneration())
      await qc.invalidateQueries({ queryKey: [...workspaceMembersPrefix, identityKey(current)] })
  }
  async function saveName(value: string) {
    const name = value.trim()
    if (!name || name.length > 80) throw new Error('Enter a name of up to 80 characters')
    if (cloud) {
      await saveProfile({ name })
      return name
    }
    const local = getCurrentUser()
    if (getCurrentUserSource() !== 'local' || !local || local.id !== profile?.id)
      throw new Error('This profile is managed by your sign-in provider')
    setLocalUser({ ...local, name })
    return name
  }
  async function saveAvatar(value: string) {
    const avatar = value.trim()
    if (avatar && !isAvatar(avatar)) throw new Error('Enter an HTTP or HTTPS image URL')
    await saveProfile({ avatar: avatar || null })
  }
  function getStatus() {
    if (demo) return 'signed-out'
    if (!cloud) return profile ? 'ready' : 'error'
    if (identity === undefined) return query.isError ? 'error' : 'loading'
    if (!identity || (identity.type === 'user' && identity.isAnonymous)) return 'signed-out'
    return 'ready'
  }
  return {
    cloud,
    demo: demo || (identity?.type === 'user' && identity.isAnonymous),
    profile,
    identity,
    status: getStatus(),
    email: registered && identity?.type === 'user' ? identity.email : undefined,
    canEdit: cloud ? registered : source === 'local',
    registered,
    saveName,
    saveAvatar,
    signOut,
    retry: () => (cloud ? void query.refetch() : window.location.reload())
  }
}
type AccountState = ReturnType<typeof useAccountState>
const AccountContext = createContext<AccountState | undefined>(undefined)
type AccountProviderProps = { children: ReactNode }
export function AccountProvider({ children }: AccountProviderProps) {
  const account = useAccountState()
  return <AccountContext value={account}>{children}</AccountContext>
}
export function useAccount() {
  const account = useContext(AccountContext)
  if (!account) throw new Error('AccountProvider is required')
  return account
}
