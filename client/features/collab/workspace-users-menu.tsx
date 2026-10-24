import { useState, useSyncExternalStore } from 'react'

import { IconChevronDown } from '@tabler/icons-react'
import type { Icon as TabIcon } from '@tabler/icons-react'
import { useRouter } from 'wouter'
import { usePathname } from 'wouter/use-browser-location'

import { Button } from '@/client/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger
} from '@/client/components/ui/popover'
import { cn } from '@/client/lib/cn'
import type { WorkspaceTabId } from '@/lib/types'
import { tabFromPath } from '@/lib/workspace-tabs'

import { UserContainer } from './components/user'
import { UserAvatarGroupContainer as UserAvatarGroup } from './components/user-avatar-group'
import { pageFromPath, useCollabEnabled, useCollabEngine } from './provider'
import { useConnectionState, useWorkspaceUsers } from './hooks'
import { summarizeWorkspaceUsers } from './users'
import type { WorkspaceUserInfo } from './users'

export type TabInfo = { label: string; Icon: TabIcon }
type DescribeTab = (tab: WorkspaceTabId) => TabInfo | null
const USER_STATUS_ORDER = { active: 0, away: 1, offline: 2 }

type WorkspaceUsersMenuProps = {
  workspaceId: string
  describeTab: DescribeTab
  onOpenTab: (tab: WorkspaceTabId) => void
}

export function WorkspaceUsersMenu({
  workspaceId,
  describeTab,
  onOpenTab
}: WorkspaceUsersMenuProps) {
  const enabled = useCollabEnabled()
  const engine = useCollabEngine()
  const state = useConnectionState()
  const workspaceUsers = useWorkspaceUsers()
  const currentUser = useSyncExternalStore(
    engine.subscribeCurrentUser,
    engine.getCurrentUser,
    engine.getCurrentUser
  )
  const router = useRouter()
  const page = pageFromPath(usePathname(router), workspaceId, router.base)
  const users = summarizeWorkspaceUsers(state.connections, {
    currentUser,
    connectionId: state.connectionId,
    users: workspaceUsers,
    page
  })
  const avatarIds = users
    .filter(user => user.self || user.status !== 'offline')
    .map(user => user.profile.id)
  const [open, setOpen] = useState(false)

  if (!enabled) return null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            aria-label="Users in this workspace"
            className="gap-0.5 rounded-full pr-1 pl-1 data-popup-open:bg-accent"
          />
        }
      >
        <UserAvatarGroup ids={avatarIds} size="xs" max={4} />
        <IconChevronDown stroke={2.5} className="size-3! text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="end" className="max-w-64 p-1">
        <PopoverTitle className="sr-only">Users in this workspace</PopoverTitle>
        <WorkspaceUsersList
          users={users}
          page={page}
          describeTab={describeTab}
          onOpenTab={tab => {
            setOpen(false)
            onOpenTab(tab)
          }}
        />
        {users.length === 0 && (
          <p className="px-2 py-1 text-xs text-muted-foreground">No workspace users to show.</p>
        )}
      </PopoverContent>
    </Popover>
  )
}

type WorkspaceUsersListProps = {
  users: WorkspaceUserInfo[]
  page: string
  describeTab: DescribeTab
  onOpenTab: (tab: WorkspaceTabId) => void
}

export function WorkspaceUsersList({
  users,
  page,
  describeTab,
  onOpenTab
}: WorkspaceUsersListProps) {
  const sorted = users.toSorted(
    (a, b) =>
      USER_STATUS_ORDER[a.status] - USER_STATUS_ORDER[b.status] || Number(b.self) - Number(a.self)
  )
  const groups: { label: string; users: WorkspaceUserInfo[] }[] = [
    { label: 'People', users: [] },
    { label: 'Bots', users: [] }
  ]
  for (const user of sorted) {
    const bot = /\+(bot|grok)/i.test(user.profile.email?.split('@')[0] ?? '')
    groups[bot ? 1 : 0]!.users.push(user)
  }
  return (
    <div className="flex max-h-80 scroll-fade flex-col gap-1 overflow-y-auto">
      {groups
        .filter(group => group.users.length > 0)
        .map(group => (
          <section key={group.label} aria-label={group.label}>
            <h3 className="px-2 py-1 text-xs text-muted-foreground">{group.label}</h3>
            <ul>
              {group.users.map(user => (
                <UserRow
                  key={user.profile.id}
                  user={user}
                  page={page}
                  describeTab={describeTab}
                  onOpenTab={onOpenTab}
                />
              ))}
            </ul>
          </section>
        ))}
    </div>
  )
}

type UserRowProps = Omit<WorkspaceUsersListProps, 'users'> & { user: WorkspaceUserInfo }

function UserRow({ user, page, describeTab, onOpenTab }: UserRowProps) {
  const tabs = user.pages.map(candidate => {
    const tab = tabFromPath(candidate)
    return { tab, info: tab ? describeTab(tab) : null }
  })
  const destination =
    user.self || user.status === 'offline'
      ? undefined
      : tabs.find(({ tab, info }) => tab !== null && info !== null && tab !== page)
  const target = destination?.tab
  const labels = [
    ...new Set(tabs.map(({ tab, info }) => info?.label ?? tab ?? 'Another tab'))
  ].join(', ')
  const where =
    user.status === 'offline'
      ? 'Offline'
      : user.status === 'away'
        ? labels
          ? `${labels} · Away`
          : 'Away'
        : labels || 'Another tab'
  const Icon = user.status === 'offline' ? undefined : tabs[0]?.info?.Icon
  const content = (
    <UserContainer
      id={user.profile.id}
      className="flex-1"
      size="sm"
      showYouLabel
      description={
        <span className="flex items-center gap-1 text-xs">
          {Icon && <Icon size={12} stroke={1.75} className="shrink-0" />}
          <span className="truncate">{where}</span>
        </span>
      }
    />
  )
  const row = 'flex w-full items-center gap-2.5 rounded-md px-2 py-1 text-left'

  return (
    <li>
      {target ? (
        <button
          type="button"
          title={`Go to ${destination?.info?.label}`}
          className={cn(
            row,
            'cursor-pointer outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50'
          )}
          onClick={() => onOpenTab(target)}
        >
          {content}
        </button>
      ) : (
        <div className={row}>{content}</div>
      )}
    </li>
  )
}
