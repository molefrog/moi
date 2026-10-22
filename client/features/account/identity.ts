import { getCurrentUser, getDirectory, publishUsers } from '@/client/features/collab/host-state'
import type { CloudSession, CloudTeam } from './api'

// The session identifies the viewer. Keep the injected directory until the team
// request resolves, and preserve known avatar and color information by user id.
export function syncCloudIdentity(session: CloudSession, team?: CloudTeam): void {
  if (!session || session.user.isAnonymous) {
    publishUsers({ users: [] })
    return
  }
  const { id, name, email } = session.user
  const sameAccount = getCurrentUser()?.id === id
  const known = new Map((getDirectory() ?? []).map(user => [user.id, user]))
  const users =
    team?.members.map(user => ({
      ...known.get(user.userId),
      id: user.userId,
      name: user.name,
      email: user.email
    })) ?? (sameAccount ? [...known.values()] : [])
  const profile = { ...known.get(id), id, name, email }
  publishUsers({ me: id, users: [...users.filter(user => user.id !== id), profile] })
}
