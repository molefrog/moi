import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAppConfig } from '@/client/api/app-config'
import {
  getCurrentUser,
  getCurrentUserSource,
  setLocalUser,
  subscribeCurrentUserStore,
  publishUsers
} from '@/client/features/collab/host-state'
import {
  accountKeys,
  CloudApiError,
  sessionQuery,
  teamQuery,
  updateCloudName,
  signOutCloud
} from './api'
import type { CloudSession } from './api'
import { syncCloudIdentity } from './identity'

function useAccountState() {
  const { environment, demo } = useAppConfig()
  const cloud = environment === 'cloud'
  const profile = useSyncExternalStore(subscribeCurrentUserStore, getCurrentUser, getCurrentUser)
  const source = useSyncExternalStore(
    subscribeCurrentUserStore,
    getCurrentUserSource,
    getCurrentUserSource
  )
  const qc = useQueryClient()
  const session = useQuery({ ...sessionQuery, enabled: cloud && !demo })
  const registered = cloud && !demo && !!session.data && !session.data.user.isAnonymous
  const team = useQuery({ ...teamQuery(session.data?.user.id), enabled: registered })
  const [removingMemberIds, setRemovingMemberIds] = useState<string[]>([])

  const signOut = useMutation({
    mutationFn: signOutCloud,
    onSuccess: async () => {
      await qc.cancelQueries({ queryKey: accountKeys.all })
      publishUsers({ users: [] })
      qc.setQueryData(accountKeys.session, null)
      qc.removeQueries({ queryKey: accountKeys.team })
      window.location.assign('/cloud/login')
    }
  })
  useEffect(() => {
    if (!cloud || demo || !session.isSuccess || signOut.isPending || signOut.isSuccess) return
    syncCloudIdentity(session.data, registered ? team.data : undefined)
  }, [
    cloud,
    demo,
    session.data,
    session.isSuccess,
    registered,
    team.data,
    signOut.isPending,
    signOut.isSuccess
  ])
  useEffect(() => {
    if (team.error instanceof CloudApiError && team.error.status === 401)
      void qc.invalidateQueries({ queryKey: accountKeys.session })
  }, [team.error, qc])

  async function saveName(value: string) {
    const name = value.trim()
    if (!name || name.length > 80) throw new Error('Enter a name of up to 80 characters')
    if (cloud) {
      if (!registered) throw new Error('Sign in to change your name')
      await qc.cancelQueries({ queryKey: accountKeys.session })
      await updateCloudName(name).catch(error => {
        if (error instanceof CloudApiError && error.status === 401)
          void qc.invalidateQueries({ queryKey: accountKeys.session })
        throw error
      })
      const latestSession = qc.getQueryData<CloudSession>(accountKeys.session)
      if (
        !latestSession ||
        latestSession.user.id !== session.data!.user.id ||
        latestSession.user.isAnonymous
      )
        throw new Error('Your account changed. Reload Moi to try again.')
      const next: CloudSession = { user: { ...latestSession.user, name } }
      qc.setQueryData(accountKeys.session, next)
      syncCloudIdentity(next, team.data)
      void qc.invalidateQueries({ queryKey: accountKeys.team })
      return name
    }
    const localProfile = getCurrentUser()
    if (getCurrentUserSource() !== 'local' || !localProfile || localProfile.id !== profile?.id)
      throw new Error('This profile is managed by your sign-in provider')
    setLocalUser({ ...localProfile, name })
    return name
  }

  function getStatus() {
    if (demo) return 'signed-out'
    if (!cloud) return profile ? 'ready' : 'error'
    if (session.isPending) return 'loading'
    if (session.isError) return 'error'
    if (!registered) return 'signed-out'
    if (profile?.id === session.data?.user.id && source === 'external') return 'ready'
    return 'loading'
  }

  return {
    cloud,
    demo: demo || (cloud && session.data?.user.isAnonymous === true),
    profile,
    status: getStatus(),
    email: registered ? session.data?.user.email : undefined,
    canEdit: cloud ? registered : source === 'local',
    registered,
    team,
    removingMemberIds,
    setRemovingMemberIds,
    saveName,
    signOut,
    retry: () => {
      if (!cloud) {
        window.location.reload()
        return
      }
      void session.refetch()
      if (registered) void team.refetch()
    }
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
