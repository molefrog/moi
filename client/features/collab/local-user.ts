import { USER_COLORS } from '@/lib/collab/colors'
import type { UserColor } from '@/lib/collab/colors'
import type { UserProfile } from '@/lib/collab/types'

const LOCAL_USER_NAMES = [
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

export type LocalUserDraft = { name: string; color: UserColor }

function pick<T>(items: readonly T[], except?: T): T {
  const pool = items.filter(item => item !== except)
  return pool[Math.floor(Math.random() * pool.length)] ?? items[0]
}

export function randomLocalUser(current?: LocalUserDraft): LocalUserDraft {
  return {
    name: pick(LOCAL_USER_NAMES, current?.name),
    color: pick(USER_COLORS, current?.color)
  }
}

export function localUserProfile(id: string, draft: LocalUserDraft): UserProfile {
  const name = draft.name.trim()
  return { id, ...(name ? { name } : {}), color: draft.color }
}

// The id stays with the tab through renames, so peers keep seeing one user.
export function createLocalUser(): UserProfile {
  return localUserProfile(`local-${crypto.randomUUID().slice(0, 8)}`, randomLocalUser())
}
