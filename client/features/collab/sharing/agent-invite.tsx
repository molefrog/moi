import { useId } from 'react'
import { Button } from '@/client/components/ui/button'

export function AgentInvite() {
  const headingId = useId()
  const availabilityId = useId()
  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-3 rounded-2xl bg-popover p-5 shadow-md"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <h3 id={headingId} className="text-sm font-medium">
            Invite your agent
          </h3>
          <p className="text-sm text-muted-foreground">
            Give your agent a prompt to work in this workspace on your behalf
          </p>
        </div>
      </div>
      <Button variant="secondary" className="self-start" disabled aria-describedby={availabilityId}>
        Copy prompt
      </Button>
      <span id={availabilityId} className="sr-only">
        Agent invitations aren’t available yet
      </span>
    </section>
  )
}
