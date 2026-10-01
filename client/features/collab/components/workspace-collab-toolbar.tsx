import { useState, useSyncExternalStore } from 'react'

import {
  IconArrowRight,
  IconCheck,
  IconChevronDown,
  IconShare,
  IconUserEdit
} from '@tabler/icons-react'
import type { Icon as TabIcon } from '@tabler/icons-react'
import { Link, useRouter } from 'wouter'
import { usePathname } from 'wouter/use-browser-location'

import { Button, buttonVariants } from '@/client/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger
} from '@/client/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/client/components/ui/tooltip'
import { cn } from '@/client/lib/cn'
import type { WorkspaceTabId } from '@/lib/types'
import { tabFromPath } from '@/lib/navigation'
import { Avatar, AvatarFallback } from '@/ui-components/avatar'

import { UserAvatar } from './user-avatar'
import { pageFromPath, useCollabEnabled } from '../provider'
import { useConnectionState, useWorkspaceUsers, useWorkspaceDirectory } from '../hooks'
import {
  getCurrentUser,
  getCurrentUserSource,
  shareWorkspace,
  subscribeCurrentUserStore
} from '../host-state'
import { summarizeWorkspaceUsers, userDisplayName } from '../users'
import type { WorkspaceUserInfo } from '../users'

export type TabInfo = { label: string; Icon: TabIcon }
type DescribeTab = (tab: WorkspaceTabId) => TabInfo | null

type WorkspaceCollabToolbarProps = {
  workspaceId: string
  describeTab: DescribeTab
  onOpenTab: (tab: WorkspaceTabId) => void
}

// Faces shown in the header before the rest collapse into a count.
const MAX_FACES = 3

export function WorkspaceCollabToolbar({
  workspaceId,
  describeTab,
  onOpenTab
}: WorkspaceCollabToolbarProps) {
  const enabled = useCollabEnabled()
  const state = useConnectionState()
  const workspaceUsers = useWorkspaceUsers()
  const directory = useWorkspaceDirectory()
  const currentUser = useSyncExternalStore(
    subscribeCurrentUserStore,
    getCurrentUser,
    getCurrentUser
  )
  const router = useRouter()
  const path = usePathname(router)
  const page = pageFromPath(path, workspaceId, router.base)
  const userInfo = summarizeWorkspaceUsers(state.connections, {
    currentUser,
    connectionId: state.connectionId,
    users: workspaceUsers,
    page
  })
  const self = userInfo.find(user => user.self)
  const others = userInfo.filter(user => !user.self)
  const connected = others.filter(user => user.status !== 'offline')
  const hidden = Math.max(0, connected.length - MAX_FACES)
  const [open, setOpen] = useState(false)
  const jump = (tab: WorkspaceTabId) => {
    setOpen(false)
    onOpenTab(tab)
  }
  const canEdit = getCurrentUserSource() === 'local'
  if (!enabled || !currentUser) return null
  return (
    <div className="flex items-center gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <span className="flex items-center -space-x-2">
          {connected.slice(0, MAX_FACES).map(user => (
            <Face
              key={user.profile.id}
              user={user}
              place={placeOf(user, page, describeTab)}
              onJump={jump}
            />
          ))}
          {hidden > 0 && (
            <Avatar size="sm" className="ring-2 ring-background" title={`${hidden} more`}>
              <AvatarFallback>+{hidden}</AvatarFallback>
            </Avatar>
          )}
          <PopoverTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                aria-label="Users in this workspace"
                className="gap-0.5 rounded-full pr-1 pl-0.5 data-[popup-open]:bg-accent"
              />
            }
          >
            {self && <UserAvatar id={self.profile.id} className="ring-2 ring-background" />}
            <IconChevronDown stroke={1.75} className="text-muted-foreground" />
          </PopoverTrigger>
        </span>
        <PopoverContent align="end" className="gap-2 p-2">
          <PopoverTitle className="sr-only">Users in this workspace</PopoverTitle>
          {self && (
            <div className="flex items-center gap-3 px-2 pt-1">
              <UserAvatar id={self.profile.id} size="lg" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {userDisplayName(self.profile)}{' '}
                <span className="font-normal text-muted-foreground">(you)</span>
              </span>
            </div>
          )}
          {canEdit && (
            <Link
              href="/dev/collab"
              className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'mx-2')}
            >
              <IconUserEdit stroke={1.75} />
              Change name or avatar
            </Link>
          )}
          <div className="border-t border-border" />
          {others.length > 0 ? (
            <ul className="flex flex-col">
              {others.map(user => (
                <UserRow
                  key={user.profile.id}
                  user={user}
                  place={placeOf(user, page, describeTab)}
                  onJump={jump}
                />
              ))}
            </ul>
          ) : (
            <p className="px-2 pb-1 text-xs text-muted-foreground">
              {directory?.status === 'loading'
                ? 'Loading workspace users…'
                : 'No other workspace users to show.'}
            </p>
          )}
        </PopoverContent>
      </Popover>
      <ShareButton workspaceId={workspaceId} />
    </div>
  )
}

type Place = { where: string; Icon?: TabIcon; target: WorkspaceTabId | null; away: boolean }

function placeOf(user: WorkspaceUserInfo, page: string, describeTab: DescribeTab): Place {
  const tabs = user.pages.map(candidate => {
    const tab = tabFromPath(candidate)
    return { tab, info: tab ? describeTab(tab) : null }
  })
  const away = user.status !== 'active'
  const pages = tabs.map(({ tab, info }) => info?.label ?? tab ?? 'Another tab').join(', ')
  return {
    away,
    where: away
      ? user.status === 'offline'
        ? 'Offline'
        : pages
          ? `Away · ${pages}`
          : 'Away'
      : pages || 'Another tab',
    Icon: tabs[0]?.info?.Icon,
    // The first tab of theirs that you are not already on.
    target: tabs.find(({ tab, info }) => tab !== null && info !== null && tab !== page)?.tab ?? null
  }
}

// A face in the header stack: hover names the user and where they are,
// and a click opens the tab they are on.
type FaceProps = { user: WorkspaceUserInfo; place: Place; onJump: (tab: WorkspaceTabId) => void }
function Face({ user, place, onJump }: FaceProps) {
  const target = place.target
  const hint = place.away
    ? place.where
    : target
      ? `Click to go to ${place.where}`
      : `Also on ${place.where}`
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          target ? (
            <button
              type="button"
              className="flex cursor-pointer rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              onClick={() => onJump(target)}
            />
          ) : (
            <span className="flex" />
          )
        }
      >
        <UserAvatar id={user.profile.id} className="ring-2 ring-background" />
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <span className="flex flex-col">
          <span>{userDisplayName(user.profile)}</span>
          <span className="font-normal text-muted-foreground">{hint}</span>
        </span>
      </TooltipContent>
    </Tooltip>
  )
}

type UserRowProps = { user: WorkspaceUserInfo; place: Place; onJump: (tab: WorkspaceTabId) => void }
function UserRow({ user, place, onJump }: UserRowProps) {
  const { Icon, where, target } = place
  const content = (
    <>
      <UserAvatar id={user.profile.id} size="default" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm">{userDisplayName(user.profile)}</span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          {Icon && <Icon size={12} stroke={1.75} className="shrink-0" />}
          <span className="truncate">{where}</span>
        </span>
      </span>
      <span className="flex w-4 shrink-0 justify-end text-muted-foreground">
        {target && <IconArrowRight size={16} stroke={1.75} />}
      </span>
    </>
  )
  const row = 'flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left'
  return (
    <li>
      {target ? (
        <button
          type="button"
          title={`Go to ${where}`}
          className={cn(
            row,
            'cursor-pointer outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50'
          )}
          onClick={() => onJump(target)}
        >
          {content}
        </button>
      ) : (
        <div className={row}>{content}</div>
      )}
    </li>
  )
}

type ShareButtonProps = { workspaceId: string }
function ShareButton({ workspaceId }: ShareButtonProps) {
  const [sharing, setSharing] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const share = async () => {
    setSharing(true)
    setError(null)
    try {
      const outcome = await shareWorkspace(workspaceId)
      setResult(outcome === 'copied' ? 'Link copied' : 'Shared')
    } catch {
      setError('Couldn’t share this workspace. Try again or copy its address.')
    } finally {
      setSharing(false)
    }
  }
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void share()
            }}
            disabled={sharing}
          />
        }
      >
        {result ? <IconCheck stroke={1.75} /> : <IconShare stroke={1.75} />}
        Share
      </PopoverTrigger>
      <PopoverContent align="end">
        <PopoverTitle>
          {sharing
            ? 'Sharing workspace…'
            : error
              ? 'Couldn’t share workspace'
              : (result ?? 'Share workspace')}
        </PopoverTitle>
        <p className="text-sm text-muted-foreground">{error ?? 'Copy a link to this workspace.'}</p>
      </PopoverContent>
    </Popover>
  )
}
