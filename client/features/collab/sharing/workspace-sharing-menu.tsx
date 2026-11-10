import { useRef, useState } from 'react'
import { IconChevronDown } from '@tabler/icons-react'
import { useRouter } from 'wouter'
import { usePathname } from 'wouter/use-browser-location'
import { Button } from '@/client/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/client/components/ui/popover'
import type { Icon as TabIcon } from '@tabler/icons-react'
import type { WorkspaceTabId } from '@/lib/types'
import { tabFromPath } from '@/lib/workspace-tabs'
import { userDisplayName } from '@/client/lib/user-display-name'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/client/components/ui/tooltip'
import { UserAvatar } from '../components/user-avatar'
import { AvatarGroup, AvatarGroupCount } from '@/ui-components/avatar'
import { useWorkspaceMembers } from '../members/hooks'
import { collabIdentityId } from '../../identity/types'
import { pageFromPath } from '../presence/provider'
import { useConnectionState, useWorkspaceUsers, useMe } from '../presence/hooks'
import { summarizeWorkspaceUsers, type WorkspaceUserInfo } from '../presence/users'
import { WorkspaceMembers } from './workspace-members'
// import { AgentInvite } from './agent-invite'

export type TabInfo = { label: string; Icon: TabIcon }
type WorkspaceSharingMenuProps = {
  workspaceId: string
  describeTab: (tab: WorkspaceTabId) => TabInfo | null
  onOpenTab: (tab: WorkspaceTabId) => void
}
export function WorkspaceSharingMenu({
  workspaceId,
  describeTab,
  onOpenTab
}: WorkspaceSharingMenuProps) {
  const state = useConnectionState()
  const workspaceUsers = useWorkspaceUsers()
  const currentUser = useMe()
  const router = useRouter()
  const page = pageFromPath(usePathname(router), workspaceId, router.base)
  const membership = useWorkspaceMembers(workspaceId)
  const memberIds = membership.members && new Set(membership.members.map(collabIdentityId))
  const members = memberIds
    ? workspaceUsers.filter(user => user.id === currentUser?.id || memberIds.has(user.id))
    : workspaceUsers
  const users = summarizeWorkspaceUsers(state.connections, {
    currentUser,
    users:
      membership.isSuccess && currentUser && !members.some(user => user.id === currentUser.id)
        ? [currentUser, ...members]
        : members,
    page
  })
  const active = users.filter(user => user.status === 'active')
  const shown = active.slice(0, 4).toReversed()
  const hidden = active.length - shown.length
  const [open, setOpen] = useState(false)
  const headerRef = useRef<HTMLDivElement>(null)

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen, details) => {
        // Sibling avatar controls handle their own clicks, including toggling sharing.
        if (
          details.reason === 'outside-press' &&
          details.event.target instanceof Node &&
          headerRef.current?.contains(details.event.target)
        ) {
          details.cancel()
          return
        }
        setOpen(nextOpen)
      }}
    >
      <div ref={headerRef} className="group/sharing relative inline-flex items-center rounded-full">
        <PopoverTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              aria-label="Users in this workspace"
              className="absolute inset-0 h-full w-full justify-end gap-0.5 rounded-full pr-1 pl-1 group-hover/sharing:bg-accent data-popup-open:bg-accent"
            />
          }
        >
          <IconChevronDown stroke={2.5} className="size-3! text-muted-foreground" />
        </PopoverTrigger>
        <div className="pointer-events-none flex h-7 items-center gap-0.5 px-1">
          <AvatarGroup>
            {hidden > 0 && (
              <Button
                variant={null}
                size="icon-xs"
                data-slot="avatar"
                data-size="xs"
                className="pointer-events-auto relative size-5 rounded-full p-0"
                aria-label={`${hidden} more active users`}
                onClick={() => setOpen(value => !value)}
              >
                <AvatarGroupCount size="xs">+{hidden}</AvatarGroupCount>
              </Button>
            )}
            {shown.map(user => (
              <MemberAvatar
                key={user.profile.id}
                user={user}
                page={page}
                describeTab={describeTab}
                onToggleSharing={() => setOpen(value => !value)}
                onOpenTab={tab => {
                  setOpen(false)
                  onOpenTab(tab)
                }}
              />
            ))}
          </AvatarGroup>
          <span aria-hidden="true" className="size-3" />
        </div>
      </div>
      <PopoverContent
        initialFocus={false}
        align="end"
        className="w-96 max-w-[calc(100vw-2rem)] gap-2 bg-transparent p-0 shadow-none"
      >
        <WorkspaceMembers workspaceId={workspaceId} users={users} membership={membership} />
        {/* Enable once agent invitations are functional and the card is polished. */}
        {/* <AgentInvite /> */}
      </PopoverContent>
    </Popover>
  )
}

type MemberAvatarProps = Pick<WorkspaceSharingMenuProps, 'describeTab' | 'onOpenTab'> & {
  user: WorkspaceUserInfo
  page: string
  onToggleSharing: () => void
}

function MemberAvatar({ user, page, describeTab, onOpenTab, onToggleSharing }: MemberAvatarProps) {
  const tab = user.page ? tabFromPath(user.page) : null
  const info = tab ? describeTab(tab) : null
  const name = userDisplayName(user.profile)
  return (
    <div data-slot="avatar" data-size="xs" className="relative size-5 shrink-0">
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant={null}
              size="icon-xs"
              data-slot="avatar"
              data-size="xs"
              className="pointer-events-auto relative size-5 rounded-full p-0"
              aria-label={user.self ? `${name} (You), open sharing` : name}
              onClick={() => {
                if (user.self) onToggleSharing()
                else if (tab && info && tab !== page) {
                  onOpenTab(tab)
                }
              }}
            />
          }
        >
          <UserAvatar profile={user.profile} size="xs" />
        </TooltipTrigger>
        <TooltipContent className="flex-col gap-1 text-center">
          <div>
            {name}
            {user.self ? ' (You)' : ''}
          </div>
          {info && (
            <div className="flex items-center justify-center gap-0.5 text-muted-foreground">
              <info.Icon size={12} stroke={1.75} />
              {info.label}
            </div>
          )}
        </TooltipContent>
      </Tooltip>
    </div>
  )
}
