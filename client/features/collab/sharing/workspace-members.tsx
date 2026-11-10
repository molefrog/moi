import { useState } from 'react'
import { IconX } from '@tabler/icons-react'
import { Button } from '@/client/components/ui/button'
import { Input } from '@/client/components/ui/input'
import { Spinner } from '@/client/components/ui/spinner'
import { PopoverTitle } from '@/client/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/client/components/ui/tooltip'
import { toast } from '@/client/components/ui/toast'
import { cn } from '@/client/lib/cn'
import { colorForId } from '@/lib/collab/colors'
import { CloudApiError } from '../../account/api'
import { useIdentity } from '../../identity/use-identity'
import { collabIdentityId, identityKey } from '../../identity/types'
import { getAccountGeneration } from '../../identity/store'
import { User } from '../components/user'
import {
  type useWorkspaceMembers,
  useMembershipAction,
  type MembershipAction
} from '../members/hooks'
import type { WorkspaceMember, WorkspaceInvitation } from '../members/types'
import type { WorkspaceUserInfo } from '../presence/users'

export type WorkspaceMembersProps = {
  workspaceId: string
  users: WorkspaceUserInfo[]
  membership: ReturnType<typeof useWorkspaceMembers>
}

export function WorkspaceMembers({ workspaceId, users, membership }: WorkspaceMembersProps) {
  const identity = useIdentity()
  const membersById =
    membership.members &&
    new Map(membership.members.map(member => [collabIdentityId(member), member]))
  return (
    <div className="flex flex-col rounded-2xl bg-popover p-5 shadow-md">
      <PopoverTitle>Share this workspace</PopoverTitle>
      <InviteForm
        className="mt-3"
        key={`${workspaceId}:${identity ? identityKey(identity) : ''}`}
        workspaceId={workspaceId}
        members={membership.members ?? []}
        invitations={membership.invitations ?? []}
      />
      <MembersList
        className="-mx-2 -my-1 mt-3"
        workspaceId={workspaceId}
        users={users}
        membersById={membersById}
        invitations={membership.invitations ?? []}
      />
      {membership.isError && (
        <div className="px-2 py-1 text-xs text-muted-foreground">
          <p>Couldn’t refresh workspace members</p>
          <Button variant="ghost" size="sm" onClick={() => void membership.refetch()}>
            Retry
          </Button>
        </div>
      )}
      {membership.isPending && (
        <div className="flex items-center justify-center py-6">
          <Spinner className="text-muted-foreground" aria-label="Loading workspace members" />
        </div>
      )}
    </div>
  )
}

type InviteFormProps = {
  className?: string
  workspaceId: string
  members: WorkspaceMember[]
  invitations: WorkspaceInvitation[]
}

function InviteForm({ className, workspaceId, members, invitations }: InviteFormProps) {
  const [email, setEmail] = useState('')
  const invite = useMembershipAction(workspaceId)
  async function submit() {
    const address = email.trim().toLowerCase()
    if (!address || invite.isPending) return
    const generation = getAccountGeneration()
    setEmail('')
    const existingMember = members.some(
      member => member.type === 'user' && member.email.trim().toLowerCase() === address
    )
    const existingInvitation = invitations.some(
      invitation => invitation.email.trim().toLowerCase() === address
    )
    if (existingMember || existingInvitation) {
      toast.add({
        title: existingMember
          ? 'The user is already in this workspace'
          : 'The user is already invited',
        type: 'info'
      })
      return
    }
    try {
      await invite.mutateAsync({ type: 'invite', email: address })
      if (generation !== getAccountGeneration()) return
      toast.add({ title: 'Invitation sent', description: `Sent to ${address}`, type: 'success' })
    } catch (error) {
      if (generation !== getAccountGeneration()) return
      if (
        error instanceof CloudApiError &&
        (error.code === 'ALREADY_MEMBER' ||
          error.code === 'ALREADY_OWNER' ||
          error.code === 'ALREADY_INVITED')
      ) {
        toast.add({
          title:
            error.code === 'ALREADY_INVITED'
              ? 'The user is already invited'
              : 'The user is already in this workspace',
          type: 'info'
        })
        return
      }
      setEmail(email)
      toast.add({
        title: 'Couldn’t send invitation',
        description: error instanceof Error ? error.message : 'Try again',
        type: 'error'
      })
    }
  }
  return (
    <form
      className={cn('flex gap-2', className)}
      onSubmit={event => {
        event.preventDefault()
        void submit()
      }}
    >
      <Input
        id="invite-email"
        type="email"
        required
        aria-label="Email"
        placeholder="Email"
        autoComplete="off"
        className="min-w-0 flex-1"
        value={email}
        onChange={event => setEmail(event.target.value)}
        disabled={invite.isPending}
      />
      <Button type="submit" disabled={invite.isPending || !email.trim()}>
        Invite
      </Button>
    </form>
  )
}

type MembersListProps = {
  className?: string
  workspaceId: string
  membersById?: Map<string, WorkspaceMember>
  invitations: WorkspaceInvitation[]
  users: WorkspaceUserInfo[]
}

function MembersList({
  className,
  workspaceId,
  membersById,
  invitations,
  users
}: MembersListProps) {
  return (
    <ul
      aria-label="Who has access"
      className={cn('flex max-h-80 scroll-fade flex-col gap-0.5 overflow-y-auto', className)}
    >
      {users.map(user => (
        <MemberRow
          key={user.profile.id}
          user={user}
          workspaceId={workspaceId}
          membershipId={membersById?.get(user.profile.id)?.membershipId}
        />
      ))}
      {invitations.map(invitation => (
        <InvitationRow key={invitation.id} workspaceId={workspaceId} invitation={invitation} />
      ))}
    </ul>
  )
}

type MemberRowProps = {
  user: WorkspaceUserInfo
  workspaceId: string
  membershipId?: string
}

function MemberRow({ user, workspaceId, membershipId }: MemberRowProps) {
  return (
    <li className="flex min-w-0 items-center gap-2 px-2 py-1">
      <User
        profile={user.profile}
        className="flex-1"
        size="sm"
        showYouLabel={user.self}
        description={user.profile.email}
      />
      {membershipId && (
        <RemoveButton workspaceId={workspaceId} action={{ type: 'remove', membershipId }} />
      )}
    </li>
  )
}

type InvitationRowProps = { workspaceId: string; invitation: WorkspaceInvitation }
function InvitationRow({ workspaceId, invitation }: InvitationRowProps) {
  return (
    <li className="flex min-w-0 items-center gap-2 px-2 py-1">
      <User
        className="flex-1 text-muted-foreground **:data-[slot=avatar]:opacity-30"
        size="sm"
        profile={{
          id: invitation.id,
          email: invitation.email,
          color: colorForId(invitation.email)
        }}
        description={invitation.email}
      />
      <RemoveButton
        workspaceId={workspaceId}
        disabled={invitation.pending}
        action={{ type: 'revoke', invitationId: invitation.id }}
      />
    </li>
  )
}

type RemoveButtonProps = {
  workspaceId: string
  action: Exclude<MembershipAction, { type: 'invite' }>
  disabled?: boolean
}

function RemoveButton({ workspaceId, action, disabled }: RemoveButtonProps) {
  const mutation = useMembershipAction(workspaceId)
  const label = action.type === 'remove' ? 'Remove' : 'Revoke invitation'
  async function submit() {
    if (mutation.isPending || disabled) return
    const generation = getAccountGeneration()
    try {
      await mutation.mutateAsync(action)
    } catch (error) {
      if (generation !== getAccountGeneration()) return
      toast.add({
        title: action.type === 'remove' ? 'Couldn’t remove member' : 'Couldn’t revoke invitation',
        description: error instanceof Error ? error.message : 'Try again',
        type: 'error'
      })
    }
  }
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className="shrink-0 text-muted-foreground"
            aria-label={label}
            disabled={disabled || mutation.isPending}
            onClick={() => void submit()}
          />
        }
      >
        <IconX stroke={1.75} />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
