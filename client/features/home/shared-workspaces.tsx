import { useQuery } from '@tanstack/react-query'
import { Link } from 'wouter'
import { requestJson } from '@/client/api/http'
import { Button } from '@/client/components/ui/button'
import { WorkspaceIcon } from '@/client/components/shared/workspace-icon'
import type { WorkspaceIcon as WorkspaceIconValue } from '@/lib/types'

type SharedWorkspace = {
  id: string
  owner: { id: string; name: string }
  name: string
  icon?: WorkspaceIconValue
}
export function SharedWorkspaces() {
  const query = useQuery({
    queryKey: ['shared-workspaces'],
    queryFn: () => requestJson<SharedWorkspace[]>('/api/workspaces/shared'),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    retry: false
  })
  if (query.data?.length === 0) return null
  return (
    <section className="mb-12">
      <h2 className="mb-4 text-sm font-medium">Shared with you</h2>
      {query.isPending ? (
        <p className="text-sm text-muted-foreground">Loading shared workspaces…</p>
      ) : query.isError ? (
        <div role="alert">
          <p className="text-sm text-muted-foreground">{query.error.message}</p>
          <Button variant="ghost" onClick={() => void query.refetch()}>
            Retry
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
          {query.data.map(share => (
            <Link
              key={`${share.owner.id}/${share.id}`}
              href={`/shared/${encodeURIComponent(share.owner.id)}/${encodeURIComponent(share.id)}`}
              className="flex items-center gap-3 rounded-xl p-3 hover:bg-accent"
            >
              <WorkspaceIcon icon={share.icon} />
              <div>
                <p className="text-sm font-medium">{share.name}</p>
                <p className="text-xs text-muted-foreground">{share.owner.name}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
