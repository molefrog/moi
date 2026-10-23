import type { UserProfile } from '@/lib/collab/types'

// Presentation only: keep the supplied profile unchanged in applet APIs.
export function userDisplayName(user: UserProfile): string {
  return user.name?.trim() || user.email?.trim() || user.id
}
