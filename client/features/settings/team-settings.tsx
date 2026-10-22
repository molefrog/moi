import { useState, useSyncExternalStore } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
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

export function TeamSettings() {
  const { team } = useAccount()
  const directory = useSyncExternalStore(subscribeDirectoryStore, getDirectory, getDirectory)
  const qc = useQueryClient()
  const [email, setEmail] = useState('')
  const mutation = useMutation({
    mutationFn: (action: () => Promise<unknown>) => action(),
    onSuccess: () => qc.invalidateQueries({ queryKey: accountKeys.team }),
    onError: error => {
      toast.add({ title: 'Couldn’t update team', description: error.message, type: 'error' })
      if (error instanceof CloudApiError && error.status === 401)
        void qc.invalidateQueries({ queryKey: accountKeys.session })
    }
  })
  const pending = mutation.isPending

  function act(action: () => Promise<unknown>) {
    if (!pending) mutation.mutate(action)
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
        {members.map(member => (
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
                onClick={() => act(() => removeMember(member.id))}
              >
                Remove
              </Button>
            )}
          </li>
        ))}
      </ul>
      {owner && (
        <>
          <form
            className="flex flex-col items-start gap-3"
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
            <Field>
              <FieldLabel htmlFor="invite-email">Invite someone</FieldLabel>
              <Input
                id="invite-email"
                type="email"
                required
                autoComplete="off"
                placeholder="Email address"
                value={email}
                disabled={pending}
                onChange={event => setEmail(event.target.value)}
              />
            </Field>
            <Button type="submit" disabled={pending}>
              Send invitation
            </Button>
          </form>
          {invitations.length > 0 && (
            <section className="flex flex-col gap-3" aria-labelledby="invitations-heading">
              <h3 id="invitations-heading" className="text-sm font-medium">
                Pending invitations
              </h3>
              <ul className="flex flex-col gap-4">
                {invitations.map(invitation => (
                  <li key={invitation.id} className="flex items-center gap-3">
                    <div className="flex min-w-0 flex-1 flex-col text-sm">
                      <span className="truncate">{invitation.email}</span>
                      <span className="text-xs text-muted-foreground">
                        Expires {new Date(invitation.expiresAt).toLocaleDateString()}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      aria-label={`Cancel invitation for ${invitation.email}`}
                      onClick={() => act(() => cancelInvitation(invitation.id))}
                    >
                      Cancel
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </SettingsSection>
  )
}
