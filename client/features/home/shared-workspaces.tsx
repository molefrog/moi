import { useQuery } from '@tanstack/react-query'
import { useAppConfig } from '@/client/api/app-config'
import { cloudRequest } from '@/client/features/account/api'
import { workspaceDisplayName } from '@/client/features/workspace/workspace-presentation'
import { workspaceAddress } from '@/lib/workspace-config'
import type { WorkspaceEntry } from '@/lib/types'

export type SharedWorkspace = {
  id: string
  owner: { id: string; name: string }
  name?: string
  icon?: WorkspaceEntry['icon']
  theme?: WorkspaceEntry['theme']
  type?: WorkspaceEntry['type']
}

export function useSharedWorkspaces() {
  const cloud = useAppConfig().environment === 'cloud'
  return useQuery({
    queryKey: ['shared-workspaces'],
    enabled: cloud,
    queryFn: async () => {
      const { workspaces } = (await (await cloudRequest('workspaces/shared')).json()) as {
        workspaces: SharedWorkspace[]
      }
      return workspaces
    },
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    retry: false
  })
}

export type HomeWorkspace = Pick<WorkspaceEntry, 'id' | 'icon' | 'theme' | 'type' | 'remote'> & {
  name: string
  href: string
  addedAt?: string
  ownerName?: string
}

export function homeWorkspaces(
  entries: WorkspaceEntry[],
  shares: SharedWorkspace[]
): HomeWorkspace[] {
  const registered = new Set(
    entries.flatMap(entry =>
      entry.remote ? [workspaceAddress(entry.remote.workspace_id, entry.remote.user_id)] : []
    )
  )
  const workspaces: HomeWorkspace[] = entries.map(entry => ({
    ...entry,
    name: workspaceDisplayName(entry),
    href: `/workspace/${entry.id}`
  }))
  const unopened: HomeWorkspace[] = []
  for (const share of shares) {
    const address = workspaceAddress(share.id, share.owner.id)
    if (registered.has(address)) continue
    registered.add(address)
    unopened.push({
      id: address,
      name: share.name || share.id,
      icon: share.icon,
      theme: share.theme,
      type: share.type,
      remote: { user_id: share.owner.id, workspace_id: share.id },
      ownerName: share.owner.name,
      href: `/shared/${encodeURIComponent(share.owner.id)}/${encodeURIComponent(share.id)}`
    })
  }
  return [...unopened, ...workspaces]
}
