import { IconX } from '@tabler/icons-react'
import { Button } from '@/client/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/client/components/ui/tooltip'
import { toast } from '@/client/components/ui/toast'
import { useRemoveMember, useRevokeInvitation } from '../workspace-members/hooks'
import { getIdentityGeneration } from '../identity/store'

type WorkspaceRemoveButtonProps = {
  workspaceId: string
  target:
    | { type: 'member'; id: string; name: string }
    | { type: 'invitation'; id: string; name: string }
  disabled?: boolean
}

export function WorkspaceRemoveButton({
  workspaceId,
  target,
  disabled
}: WorkspaceRemoveButtonProps) {
  const remove = useRemoveMember(workspaceId)
  const revoke = useRevokeInvitation(workspaceId)
  const pending = remove.isPending || revoke.isPending
  const label =
    target.type === 'member' ? `Remove ${target.name}` : `Revoke invitation for ${target.name}`
  async function submit() {
    if (pending || disabled) return
    const generation = getIdentityGeneration()
    try {
      if (target.type === 'member')
        await remove.mutateAsync({ type: 'remove', membershipId: target.id })
      else await revoke.mutateAsync({ type: 'revoke', invitationId: target.id })
    } catch (error) {
      if (generation !== getIdentityGeneration()) return
      toast.add({
        title: target.type === 'member' ? 'Couldn’t remove member' : 'Couldn’t revoke invitation',
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
            className="shrink-0"
            aria-label={label}
            disabled={disabled || pending}
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
