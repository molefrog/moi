import { useState } from 'react'
import { Button } from '@/client/components/ui/button'
import { Input } from '@/client/components/ui/input'
import { toast } from '@/client/components/ui/toast'
import { useInviteMember } from '../workspace-members/hooks'
import { getIdentityGeneration } from '../identity/store'

type WorkspaceInviteFormProps = { workspaceId: string; disabled: boolean }

export function WorkspaceInviteForm({ workspaceId, disabled }: WorkspaceInviteFormProps) {
  const [email, setEmail] = useState('')
  const invite = useInviteMember(workspaceId)
  async function submit() {
    const address = email.trim().toLowerCase()
    if (!address || disabled || invite.isPending) return
    const generation = getIdentityGeneration()
    try {
      await invite.mutateAsync({ type: 'invite', email: address })
      if (generation !== getIdentityGeneration()) return
      setEmail('')
      toast.add({ title: 'Invitation sent', description: `Sent to ${address}`, type: 'success' })
    } catch (error) {
      if (generation !== getIdentityGeneration()) return
      toast.add({
        title: 'Couldn’t send invitation',
        description: error instanceof Error ? error.message : 'Try again',
        type: 'error'
      })
    }
  }
  return (
    <form
      className="flex gap-2"
      onSubmit={event => {
        event.preventDefault()
        void submit()
      }}
    >
      <Input
        id="invite-email"
        type="email"
        required
        aria-label="Email address"
        placeholder="Email address"
        autoComplete="email"
        className="min-w-0 flex-1"
        value={email}
        onChange={event => setEmail(event.target.value)}
        disabled={disabled || invite.isPending}
      />
      <Button type="submit" disabled={disabled || invite.isPending || !email.trim()}>
        {invite.isPending ? 'Sending…' : 'Invite'}
      </Button>
    </form>
  )
}
