import { USER_COLORS } from '@/lib/collab/colors'
import type { UserProfile } from '@/lib/collab/types'

import { facehashDataUrl } from '@/client/features/collab/facehash-avatar'
import { userDisplayName } from '@/client/features/collab/users'

// Test profiles are activated only by explicit setup on /dev/collab.

export const DEV_USER_NAMES = [
  'Ada',
  'Alan',
  'Grace',
  'Linus',
  'Margaret',
  'Dennis',
  'Barbara',
  'Ken',
  'Radia',
  'Hedy',
  'Edsger',
  'Frances',
  'Donald',
  'Katherine',
  'Niklaus',
  'Sophie',
  'Adele',
  'Jean',
  'Bjarne',
  'Guido',
  'Yukihiro',
  'Joe',
  'Vint',
  'Tim',
  'Mary',
  'Kathleen',
  'Brian',
  'Leslie'
]

export type DevUserDraft = { name: string; color: string }

function pick<T>(items: readonly T[], except?: T): T {
  const pool = items.filter(item => item !== except)
  return pool[Math.floor(Math.random() * pool.length)] ?? items[0]
}

export function randomDevUser(current?: DevUserDraft): DevUserDraft {
  return {
    name: pick(DEV_USER_NAMES, current?.name),
    color: pick(
      USER_COLORS.map(([, hex]) => hex),
      current?.color
    )
  }
}

export function devUserProfile(id: string, draft: DevUserDraft): UserProfile {
  const profile = { id, name: draft.name, color: draft.color }
  const avatar = facehashDataUrl(userDisplayName(profile), draft.color)
  return { ...profile, ...(avatar ? { avatar } : {}) }
}

// The id stays with the tab through renames, so peers keep seeing one user.
export function createDevUser(): UserProfile {
  return devUserProfile(`dev-${crypto.randomUUID().slice(0, 8)}`, randomDevUser())
}
