import { WorkspaceAgentInvite } from './workspace-agent-invite'
import type { ReactNode } from 'react'
import { WorkspaceRemoveButton } from './workspace-remove-button'
import { userDisplayName } from '@/client/lib/user-display-name'
import { useState, useSyncExternalStore } from 'react'

import { IconChevronDown, IconUsers } from '@tabler/icons-react'
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
import { colorForId } from '@/lib/collab/colors'
import { tabFromPath } from '@/lib/workspace-tabs'

import { WorkspaceInviteForm } from './workspace-invite-form'
import { useIdentity } from '../identity/use-identity'
import { collabIdentityId, identityKey } from '../identity/types'
import { User, UserContainer } from './components/user'
import { UserAvatarGroupContainer as UserAvatarGroup } from './components/user-avatar-group'
import { useWorkspaceMembers } from '../workspace-members/hooks'
import { pageFromPath, useCollabEngine } from './provider'
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
  const identity = useIdentity()
  const membership = useWorkspaceMembers(workspaceId)
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
        {avatarIds.length > 0 ? (
          <UserAvatarGroup ids={avatarIds} size="xs" max={4} />
        ) : (
          <IconUsers stroke={1.75} />
        )}
        <IconChevronDown stroke={2.5} className="size-3! text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 max-w-[calc(100vw-2rem)] gap-3 p-3">
        <PopoverTitle>Share</PopoverTitle>
        {identity?.type === 'user' && !identity.isAnonymous && (
          <WorkspaceInviteForm
            key={`${workspaceId}:${identityKey(identity)}`}
            workspaceId={workspaceId}
            disabled={!membership.data}
          />
        )}
        <p className="text-xs text-muted-foreground">Participants</p>
        <WorkspaceUsersList
          users={
            membership.members
              ? users.filter(user =>
                  membership.members!.some(member => collabIdentityId(member) === user.profile.id)
                )
              : users
          }
          renderAction={user => {
            const member = membership.members?.find(
              member => collabIdentityId(member) === user.profile.id
            )
            return member?.membershipId ? (
              <WorkspaceRemoveButton
                workspaceId={workspaceId}
                target={{
                  type: 'member',
                  id: member.membershipId,
                  name: userDisplayName(user.profile)
                }}
              />
            ) : undefined
          }}
          page={page}
          describeTab={describeTab}
          onOpenTab={tab => {
            setOpen(false)
            onOpenTab(tab)
          }}
        >
          {membership.invitations?.map(invitation => (
            <li
              key={`invitation:${invitation.id}`}
              className="flex min-w-0 items-center gap-2 px-2 py-1"
            >
              <User
                className="flex-1"
                size="sm"
                profile={{
                  id: invitation.id,
                  email: invitation.email,
                  color: colorForId(invitation.email)
                }}
                description={invitation.pending ? 'Sending…' : 'Invited'}
              />
              <WorkspaceRemoveButton
                workspaceId={workspaceId}
                disabled={invitation.pending}
                target={{ type: 'invitation', id: invitation.id, name: invitation.email }}
              />
            </li>
          ))}
        </WorkspaceUsersList>
        {membership.isError && (
          <div className="px-2 py-1 text-xs text-muted-foreground">
            <p>Couldn’t refresh workspace members</p>
            <Button variant="ghost" size="sm" onClick={() => void membership.refetch()}>
              Retry
            </Button>
          </div>
        )}
        {users.length === 0 && !membership.invitations?.length && !membership.isError && (
          <p className="px-2 py-1 text-xs text-muted-foreground">
            {membership.isFetching ? 'Loading workspace members…' : 'No workspace users to show'}
          </p>
        )}
        <WorkspaceAgentInvite />
      </PopoverContent>
    </Popover>
  )
}

type WorkspaceUsersListProps = {
  children?: ReactNode
  renderAction?: (user: WorkspaceUserInfo) => ReactNode
  users: WorkspaceUserInfo[]
  page: string
  describeTab: DescribeTab
  onOpenTab: (tab: WorkspaceTabId) => void
}

export function WorkspaceUsersList({
  children,
  renderAction,
  users,
  page,
  describeTab,
  onOpenTab
}: WorkspaceUsersListProps) {
  const sorted = users.toSorted(
    (a, b) =>
      USER_STATUS_ORDER[a.status] - USER_STATUS_ORDER[b.status] || Number(b.self) - Number(a.self)
  )
  return (
    <ul aria-label="Participants" className="flex max-h-80 scroll-fade flex-col overflow-y-auto">
      {sorted.map(user => (
        <UserRow
          key={user.profile.id}
          user={user}
          action={renderAction?.(user)}
          page={page}
          describeTab={describeTab}
          onOpenTab={onOpenTab}
        />
      ))}
      {children}
    </ul>
  )
}

type UserRowProps = Omit<WorkspaceUsersListProps, 'users'> & {
  user: WorkspaceUserInfo
  action?: ReactNode
}

function UserRow({ user, page, describeTab, onOpenTab, action }: UserRowProps) {
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
  const row = 'flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-2 py-1 text-left'

  return (
    <li className="flex min-w-0 items-center gap-2 pr-2">
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
      {action}
    </li>
  )
}
