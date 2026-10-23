import { useState, useSyncExternalStore } from 'react'
import { IconX } from '@tabler/icons-react'
import { useIsMutating, useMutation, useQueryClient } from '@tanstack/react-query'
import { Field, FieldLabel } from '@/ui-components/field'
import { Button } from '@/client/components/ui/button'
import { Input } from '@/client/components/ui/input'
import { Skeleton } from '@/client/components/ui/skeleton'
import { toast } from '@/client/components/ui/toast'
import { User } from '@/client/features/collab/components/user'
import {
  getDirectory,
  normalizeUserProfile,
  subscribeDirectoryStore
} from '@/client/features/collab/host-state'
import { useAccount } from '../account/account-provider'
import { SettingsSection } from './settings-section'
import {
  accountKeys,
  CloudApiError,
  cancelInvitation,
  inviteMember,
  removeMember
} from '../account/api'
import type { CloudSession, TeamMember } from '../account/api'

export function TeamSettings() {
  const { team, removingMemberIds, setRemovingMemberIds } = useAccount()
  const directory = useSyncExternalStore(subscribeDirectoryStore, getDirectory, getDirectory)
  const qc = useQueryClient()
  const [email, setEmail] = useState('')
  const mutation = useMutation({
    mutationKey: accountKeys.team,
    mutationFn: (action: () => Promise<unknown>) => action(),
    onSuccess: () => qc.invalidateQueries({ queryKey: accountKeys.team }),
    onError: error => {
      toast.add({ title: 'Couldn’t update team', description: error.message, type: 'error' })
      if (error instanceof CloudApiError && error.status === 401)
        void qc.invalidateQueries({ queryKey: accountKeys.session })
    }
  })
  const pending = useIsMutating({ mutationKey: accountKeys.team }) > 0

  function act(action: () => Promise<unknown>) {
    if (!pending) mutation.mutate(action)
  }

  function remove(member: TeamMember) {
    const userId = qc.getQueryData<CloudSession>(accountKeys.session)?.user.id
    const restore = () => setRemovingMemberIds(ids => ids.filter(id => id !== member.id))
    let undone = false
    setRemovingMemberIds(ids => [...ids, member.id])
    // Keep access intact until the toast closes, so Undo needs no restore API.
    const id = toast.add({
      title: `${member.name.trim() || member.email} removed`,
      timeout: 5000,
      onClose: () => {
        if (undone || qc.getQueryData<CloudSession>(accountKeys.session)?.user.id !== userId) {
          restore()
          return
        }
        void mutation.mutateAsync(() => removeMember(member.id)).then(restore, restore)
      },
      actionProps: {
        children: 'Undo',
        onClick: () => {
          undone = true
          toast.close(id)
        }
      }
    })
  }

  if (team.isPending)
    return (
      <SettingsSection title="Team">
        <div className="flex flex-col gap-4" aria-label="Loading team">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-24 w-full" />
        </div>
      </SettingsSection>
    )
  if (team.isError)
    return (
      <SettingsSection title="Team">
        <div className="flex flex-col items-start gap-3">
          <p role="alert">{team.error.message}</p>
          <Button variant="outline" onClick={() => void team.refetch()}>
            Try again
          </Button>
        </div>
      </SettingsSection>
    )
  const { members, invitations, role } = team.data
  const owner = role === 'owner'

  return (
    <SettingsSection title="Team">
      <ul className="flex flex-col gap-4">
        {members
          .filter(member => !removingMemberIds.includes(member.id))
          .map(member => (
            <li key={member.id} className="flex items-center gap-3">
              <User
                profile={normalizeUserProfile({
                  ...directory?.find(user => user.id === member.userId),
                  id: member.userId,
                  name: member.name,
                  email: member.email
                })}
                size="sm"
                showYouLabel={member.me}
                description={member.name?.trim() ? member.email : undefined}
                className="flex-1"
              />
              <span className="text-xs text-muted-foreground">
                {member.role === 'owner' ? 'Owner' : 'Member'}
              </span>
              {owner && !member.me && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  aria-label={`Remove ${member.email}`}
                  onClick={() => remove(member)}
                >
                  Remove
                </Button>
              )}
            </li>
          ))}
        {owner &&
          invitations.map(invitation => (
            <li
              key={`invitation-${invitation.id}`}
              className="group/invitation flex items-center gap-3"
            >
              <User
                profile={normalizeUserProfile({ id: invitation.id, email: invitation.email })}
                size="sm"
                description={`Invitation expires ${new Date(invitation.expiresAt).toLocaleDateString()}`}
                className="flex-1 text-muted-foreground [&_[data-slot=avatar]]:opacity-50"
              />
              <div className="grid shrink-0 items-center justify-items-end">
                <span className="col-start-1 row-start-1 text-xs text-muted-foreground group-focus-within/invitation:opacity-0 group-hover/invitation:opacity-0 [@media(hover:none)]:opacity-0">
                  Pending invite
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="col-start-1 row-start-1 text-muted-foreground transition-none group-focus-within/invitation:opacity-100 group-hover/invitation:opacity-100 [@media(hover:hover)]:opacity-0"
                  disabled={pending}
                  aria-label={`Cancel invitation for ${invitation.email}`}
                  onClick={() => act(() => cancelInvitation(invitation.id))}
                >
                  <IconX stroke={1.75} />
                </Button>
              </div>
            </li>
          ))}
      </ul>
      {owner && (
        <form
          className="flex items-end gap-2"
          onSubmit={event => {
            event.preventDefault()
            const value = email.trim()
            if (!value) return
            act(async () => {
              await inviteMember(value)
              setEmail('')
            })
          }}
        >
          <Field className="min-w-0 flex-1">
            <FieldLabel htmlFor="invite-email">Invite someone</FieldLabel>
            <Input
              id="invite-email"
              type="email"
              required
              autoComplete="off"
              placeholder="Email"
              value={email}
              disabled={pending}
              onChange={event => setEmail(event.target.value)}
            />
          </Field>
          <Button type="submit" disabled={pending}>
            Invite
          </Button>
        </form>
      )}
    </SettingsSection>
  )
}
