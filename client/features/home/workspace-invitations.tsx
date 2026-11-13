import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAppConfig } from '@/client/api/app-config'
import { jsonRequest } from '@/client/api/http'
import { Button } from '@/client/components/ui/button'
import { cloudRequest } from '@/client/features/account/api'

type WorkspaceInvitation = {
  id: string
  workspaceName: string
  inviter: { name: string }
}
const invitationsKey = ['workspace-invitations']

export function WorkspaceInvitations() {
  const cloud = useAppConfig().environment === 'cloud'
  const query = useQuery({
    queryKey: invitationsKey,
    enabled: cloud,
    queryFn: async () =>
      (await (await cloudRequest('/api/workspaces/invitations')).json()) as {
        invitations: WorkspaceInvitation[]
      },
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    retry: false
  })
  if (!cloud || query.data?.invitations.length === 0) return null
  return (
    <section className="mb-8">
      <h2 className="mb-4 text-sm font-medium">Invitations</h2>
      {query.isPending ? (
        <p className="text-sm text-muted-foreground">Loading invitations…</p>
      ) : query.isError ? (
        <div role="alert">
          <p className="text-sm text-muted-foreground">{query.error.message}</p>
          <Button variant="ghost" onClick={() => void query.refetch()}>
            Retry
          </Button>
        </div>
      ) : (
        <ul className="border-t border-border">
          {query.data.invitations.map(invitation => (
            <InvitationRow key={invitation.id} invitation={invitation} />
          ))}
        </ul>
      )}
    </section>
  )
}

type InvitationRowProps = { invitation: WorkspaceInvitation }
function InvitationRow({ invitation }: InvitationRowProps) {
  const client = useQueryClient()
  const accept = useMutation({
    mutationFn: () =>
      cloudRequest(
        `/api/invitations/${encodeURIComponent(invitation.id)}/accept`,
        jsonRequest('POST', {})
      ),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: invitationsKey }),
        client.invalidateQueries({ queryKey: ['shared-workspaces'] })
      ])
    }
  })
  return (
    <li className="border-b border-border px-1 py-3">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{invitation.workspaceName}</p>
          <p className="text-xs text-muted-foreground">Invited by {invitation.inviter.name}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={accept.isPending || accept.isSuccess}
          onClick={() => accept.mutate()}
        >
          {accept.isPending
            ? 'Accepting…'
            : accept.isSuccess
              ? 'Accepted'
              : accept.isError
                ? 'Try again'
                : 'Accept'}
        </Button>
      </div>
      {accept.isError && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {accept.error.message}
        </p>
      )}
    </li>
  )
}
