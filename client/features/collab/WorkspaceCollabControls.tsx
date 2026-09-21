import { useState, useSyncExternalStore } from 'react'

import {
  IconArrowRight,
  IconCheck,
  IconChevronDown,
  IconShare,
  IconUserEdit
} from '@tabler/icons-react'
import type { Icon as TabIcon } from '@tabler/icons-react'
import { Link, useLocation } from 'wouter'

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
import { parseWorkspaceTab } from '@/lib/workspace-tabs'
import { Avatar, AvatarFallback } from '@/ui-components/avatar'

import { Person } from './primitives'
import type { CollabTabInfo } from './entry'
import { pageFromPath, useConnection } from './hooks'
import { getIdentity, getIdentitySource, shareWorkspace, subscribeIdentityStore } from './identity'
import { groupPeople } from './people'
import type { PresentPerson } from './people'

type DescribeTab = (tab: WorkspaceTabId) => CollabTabInfo | null

export type WorkspaceCollabControlsProps = {
  workspaceId: string
  describeTab: DescribeTab
  onOpenTab: (tab: WorkspaceTabId) => void
}

// Faces shown in the header before the rest collapse into a count.
const MAX_FACES = 3

export function WorkspaceCollabControls({
  workspaceId,
  describeTab,
  onOpenTab
}: WorkspaceCollabControlsProps) {
  const state = useConnection()
  const identity = useSyncExternalStore(subscribeIdentityStore, getIdentity, getIdentity)
  const [path] = useLocation()
  const page = pageFromPath(path)
  const people = groupPeople(state.participants, {
    identity,
    connectionId: state.connectionId,
    page
  })
  const self = people.find(person => person.self)
  const others = people.filter(person => !person.self)
  const hidden = Math.max(0, others.length - MAX_FACES)
  const [open, setOpen] = useState(false)
  const jump = (tab: WorkspaceTabId) => {
    setOpen(false)
    onOpenTab(tab)
  }
  const canEdit = getIdentitySource() === 'dev'
  if (!identity) return null
  return (
    <div className="flex items-center gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <span className="flex items-center -space-x-2">
          {others.slice(0, MAX_FACES).map(person => (
            <Face
              key={person.identity.id}
              person={person}
              place={placeOf(person, page, describeTab)}
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
                aria-label="People in this workspace"
                className="gap-0.5 rounded-full pr-1 pl-0.5 data-[popup-open]:bg-accent"
              />
            }
          >
            {self && (
              <Person
                avatarOnly
                id={self.identity.id}
                showStatus={false}
                label={`${self.identity.name} (you)`}
                className="ring-2 ring-background"
              />
            )}
            <IconChevronDown stroke={1.75} className="text-muted-foreground" />
          </PopoverTrigger>
        </span>
        <PopoverContent align="end" className="gap-2 p-2">
          <PopoverTitle className="sr-only">People in this workspace</PopoverTitle>
          {self && (
            <div className="flex items-center gap-3 px-2 pt-1">
              <Person avatarOnly id={self.identity.id} size="lg" showStatus={false} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {self.identity.name}{' '}
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
              {others.map(person => (
                <PersonRow
                  key={person.identity.id}
                  person={person}
                  place={placeOf(person, page, describeTab)}
                  onJump={jump}
                />
              ))}
            </ul>
          ) : (
            <p className="px-2 pb-1 text-xs text-muted-foreground">
              No one else is here yet. Share the link to bring people in.
            </p>
          )}
        </PopoverContent>
      </Popover>
      <ShareButton workspaceId={workspaceId} />
    </div>
  )
}

type Place = { where: string; Icon?: TabIcon; target: WorkspaceTabId | null; away: boolean }

function placeOf(person: PresentPerson, page: string, describeTab: DescribeTab): Place {
  const tabs = person.pages.map(candidate => {
    const tab = parseWorkspaceTab(candidate)
    return { tab, info: tab ? describeTab(tab) : null }
  })
  const away = tabs.length === 0
  return {
    away,
    where: away
      ? 'Away'
      : tabs.map(({ tab, info }) => info?.label ?? tab ?? 'Another tab').join(', '),
    Icon: tabs[0]?.info?.Icon,
    // The first tab of theirs that you are not already on.
    target: tabs.find(({ tab, info }) => tab !== null && info !== null && tab !== page)?.tab ?? null
  }
}

// A face in the header stack: hover names the person and where they are,
// and a click opens the tab they are on.
type FaceProps = { person: PresentPerson; place: Place; onJump: (tab: WorkspaceTabId) => void }
function Face({ person, place, onJump }: FaceProps) {
  const target = place.target
  const hint = place.away
    ? 'Away'
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
        <Person
          avatarOnly
          id={person.identity.id}
          showStatus={false}
          className="ring-2 ring-background"
        />
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <span className="flex flex-col">
          <span>{person.identity.name}</span>
          <span className="font-normal text-muted-foreground">{hint}</span>
        </span>
      </TooltipContent>
    </Tooltip>
  )
}

type PersonRowProps = { person: PresentPerson; place: Place; onJump: (tab: WorkspaceTabId) => void }
function PersonRow({ person, place, onJump }: PersonRowProps) {
  const { Icon, where, target } = place
  const content = (
    <>
      <Person avatarOnly id={person.identity.id} size="md" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm">{person.identity.name}</span>
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
        <p className="text-sm text-muted-foreground">
          {error ?? 'Share the workspace link with your collaborators.'}
        </p>
      </PopoverContent>
    </Popover>
  )
}
