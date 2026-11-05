import { useState } from 'react'
import { Link } from 'wouter'
import { IconArrowLeft, IconMail, IconUserPlus } from '@tabler/icons-react'
import { Button } from '@/client/components/ui/button'
import { Input } from '@/client/components/ui/input'
import { Skeleton } from '@/client/components/ui/skeleton'
import { Alert, AlertDescription } from '@/ui-components/alert'
import { Badge } from '@/ui-components/badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/ui-components/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/ui-components/select'
import { useAppConfig } from '@/client/api/app-config'
import { UserAvatar } from '../collab/components/user-avatar'
import { normalizeUserProfile } from '../collab/host-state'
import { collabIdentityId } from '../identity/types'
import { useIdentity } from '../identity/use-identity'
import { useWorkspaces } from '../home/api'
import {
  useWorkspaceMembers,
  useInviteMember,
  useRemoveMember,
  useRevokeInvitation
} from '../workspace-members/hooks'
import type { WorkspaceMember } from '../workspace-members/types'
import { CloudAvatarUpload } from './cloud-avatar-upload'

export function CloudPage() {
  const { environment } = useAppConfig()
  if (environment !== 'cloud')
    return (
      <main className="mx-auto max-w-xl space-y-4 px-6 py-10 text-sm">
        <h1 className="text-xl font-medium">Share workspace</h1>
        <p className="text-muted-foreground">
          Workspace sharing is available when you sign in to Moi Run
        </p>
        <Button variant="outline" nativeButton={false} render={<Link href="/" />}>
          Back to workspaces
        </Button>
      </main>
    )
  return <WorkspaceSharing />
}

function WorkspaceSharing() {
  const workspaces = useWorkspaces()
  const [selected, setSelected] = useState<string>()
  const workspace = workspaces.data?.find(item => item.id === selected) ?? workspaces.data?.[0]
  const name = workspace?.name || 'Workspace'
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-8 px-5 py-8 text-sm sm:px-6 sm:py-12">
      <header className="space-y-5">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 w-fit"
          nativeButton={false}
          render={<Link href="/" />}
        >
          <IconArrowLeft stroke={1.75} /> Workspaces
        </Button>
        <div className="space-y-2">
          <h1 className="text-xl font-medium">Share workspace</h1>
          <p className="text-muted-foreground">Invite people to work alongside you</p>
        </div>
      </header>
      <section className="space-y-2" aria-label="Choose workspace">
        <label className="font-medium" id="sharing-workspace-label">
          Workspace
        </label>
        {workspaces.isError ? (
          <Alert variant="destructive">
            <AlertDescription>{workspaces.error.message}</AlertDescription>
          </Alert>
        ) : workspaces.isPending ? (
          <Skeleton className="h-10 w-full" />
        ) : !workspace ? (
          <p className="text-muted-foreground">Create a workspace to invite people</p>
        ) : (
          <Select value={workspace.id} onValueChange={value => setSelected(value ?? undefined)}>
            <SelectTrigger className="w-full" aria-labelledby="sharing-workspace-label">
              <SelectValue>{name}</SelectValue>
            </SelectTrigger>
            <SelectContent align="start">
              {workspaces.data.map(item => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name || 'Workspace'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </section>
      {workspace && (
        <SharingMembers key={workspace.id} workspaceId={workspace.id} workspaceName={name} />
      )}
    </main>
  )
}

type SharingMembersProps = { workspaceId: string; workspaceName: string }
type Removal =
  | { type: 'member'; id: string; name: string }
  | { type: 'invitation'; id: string; email: string }
function SharingMembers({ workspaceId, workspaceName }: SharingMembersProps) {
  const identity = useIdentity()
  const snapshot = useWorkspaceMembers(workspaceId)
  const invite = useInviteMember(workspaceId)
  const remove = useRemoveMember(workspaceId)
  const revoke = useRevokeInvitation(workspaceId)
  const [email, setEmail] = useState('')
  const [removal, setRemoval] = useState<Removal>()
  const [notice, setNotice] = useState<string>()
  const removing = remove.isPending || revoke.isPending
  const removalError = remove.error ?? revoke.error
  async function sendInvitation() {
    const address = email.trim().toLowerCase()
    setNotice(undefined)
    try {
      await invite.mutateAsync({ type: 'invite', email: address })
      setEmail('')
      setNotice(`Invitation sent to ${address}`)
    } catch {
      /* Keep the address so the invitation can be retried. */
    }
  }
  function chooseRemoval(next: Removal) {
    remove.reset()
    revoke.reset()
    setRemoval(next)
  }
  async function confirmRemoval() {
    if (!removal) return
    try {
      if (removal.type === 'member')
        await remove.mutateAsync({ type: 'remove', membershipId: removal.id })
      else await revoke.mutateAsync({ type: 'revoke', invitationId: removal.id })
      setNotice(removal.type === 'member' ? 'Member removed' : 'Invitation revoked')
      setRemoval(undefined)
    } catch {
      /* The dialog keeps the error visible and allows retry. */
    }
  }
  const inviteError = invite.error ?? snapshot.error
  return (
    <>
      <section className="space-y-3" aria-labelledby="invite-heading">
        <h2 className="font-medium" id="invite-heading">
          Invite someone
        </h2>
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={event => {
            event.preventDefault()
            void sendInvitation()
          }}
        >
          <Input
            type="email"
            required
            aria-label="Email address"
            placeholder="Email address"
            autoComplete="email"
            value={email}
            className="min-w-0 flex-1"
            onChange={event => {
              setEmail(event.target.value)
              setNotice(undefined)
            }}
            disabled={invite.isPending || !snapshot.data}
          />
          <Button type="submit" disabled={invite.isPending || !snapshot.data || !email.trim()}>
            <IconUserPlus stroke={1.5} /> {invite.isPending ? 'Sending…' : 'Send invite'}
          </Button>
        </form>
        <p className="text-muted-foreground">
          Members can view and edit everything in this workspace
        </p>
        {notice && <p role="status">{notice}</p>}
        {inviteError && (
          <Alert variant="destructive">
            <AlertDescription>{inviteError.message}</AlertDescription>
          </Alert>
        )}
        {snapshot.isError && (
          <Button size="sm" variant="outline" onClick={() => void snapshot.refetch()}>
            Try again
          </Button>
        )}
      </section>
      <section aria-labelledby="members-heading" className="space-y-3">
        <h2 id="members-heading" className="flex items-center gap-2 font-medium">
          Members{' '}
          {snapshot.members && (
            <span className="font-normal text-muted-foreground">{snapshot.members.length}</span>
          )}
        </h2>
        {snapshot.isPending ? (
          <div className="space-y-4" aria-label="Loading members">
            {[0, 1].map(row => (
              <div key={row} className="flex items-center gap-3">
                <Skeleton className="size-8 rounded-full" />
                <Skeleton className="h-4 w-40" />
              </div>
            ))}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {snapshot.members?.map(member => {
              const isMe = identity?.type === member.type && identity.id === member.id
              const displayName = member.name || (member.type === 'user' ? member.email : 'Agent')
              return (
                <li
                  key={`${member.type}:${member.id}`}
                  className="flex min-w-0 items-center gap-3 py-3"
                >
                  {isMe && identity?.type === 'user' ? (
                    <CloudAvatarUpload>
                      <MemberAvatar member={{ ...member, ...identity }} />
                    </CloudAvatarUpload>
                  ) : (
                    <MemberAvatar member={member} />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {displayName}
                      {isMe && <span className="font-normal text-muted-foreground"> (you)</span>}
                    </p>
                    {member.type === 'user' && (
                      <p className="truncate text-muted-foreground">{member.email}</p>
                    )}
                    {member.type === 'agent' && <p className="text-muted-foreground">Agent</p>}
                  </div>
                  {!member.membershipId ? (
                    <Badge variant="secondary">Owner</Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        chooseRemoval({
                          type: 'member',
                          id: member.membershipId!,
                          name: displayName
                        })
                      }
                    >
                      Remove
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>
      {!!snapshot.invitations?.length && (
        <section aria-labelledby="invitations-heading" className="space-y-3">
          <h2 id="invitations-heading" className="flex items-center gap-2 font-medium">
            Pending invitations{' '}
            <span className="font-normal text-muted-foreground">{snapshot.invitations.length}</span>
          </h2>
          <ul className="divide-y divide-border">
            {snapshot.invitations.map(invitation => (
              <li key={invitation.id} className="flex min-w-0 items-center gap-3 py-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <IconMail size={16} stroke={1.75} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{invitation.email}</p>
                  <p className="text-muted-foreground">
                    {invitation.pending
                      ? 'Sending invitation…'
                      : `Invited · Expires ${new Date(invitation.expiresAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`}
                  </p>
                </div>
                {!invitation.pending && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      chooseRemoval({
                        type: 'invitation',
                        id: invitation.id,
                        email: invitation.email
                      })
                    }
                  >
                    Revoke
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      <AlertDialog
        open={!!removal}
        onOpenChange={open => {
          if (!open && !removing) setRemoval(undefined)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {removal?.type === 'member' ? `Remove ${removal.name}?` : 'Revoke invitation?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {removal?.type === 'member'
                ? `They’ll lose access to ${workspaceName}. You can invite them again later.`
                : `The invitation for ${removal?.email ?? ''} will no longer work.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {removalError && (
            <Alert variant="destructive">
              <AlertDescription>{removalError.message}</AlertDescription>
            </Alert>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={removing}
              onClick={() => void confirmRemoval()}
            >
              {removing
                ? 'Saving…'
                : removal?.type === 'member'
                  ? 'Remove member'
                  : 'Revoke invitation'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

type MemberAvatarProps = { member: WorkspaceMember }
function MemberAvatar({ member }: MemberAvatarProps) {
  return (
    <UserAvatar
      profile={normalizeUserProfile({
        id: collabIdentityId(member),
        name: member.name || undefined,
        avatar: member.avatar,
        email: member.type === 'user' ? member.email : undefined
      })}
      size="default"
    />
  )
}
