import { useId } from 'react'
import { Avatar, AvatarFallback } from '@/ui-components/avatar'
import { Button } from '@/client/components/ui/button'

export function WorkspaceAgentInvite() {
  const headingId = useId()
  const availabilityId = useId()
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3 rounded-lg bg-muted p-3">
      <div className="flex items-start gap-3">
        <Avatar aria-hidden="true">
          <AvatarFallback>AI</AvatarFallback>
        </Avatar>
        <div className="min-w-0 space-y-1">
          <h3 id={headingId} className="text-sm font-medium">
            Invite your agent
          </h3>
          <p className="text-xs text-muted-foreground">
            Give your agent a prompt to join this workspace as a separate participant.
          </p>
        </div>
      </div>
      <Button variant="secondary" className="w-full" disabled aria-describedby={availabilityId}>
        Copy prompt
      </Button>
      <p id={availabilityId} className="text-xs text-muted-foreground">
        Agent invitations aren’t available yet
      </p>
    </section>
  )
}
