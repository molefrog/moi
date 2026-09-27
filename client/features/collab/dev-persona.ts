import { PERSONA_COLORS } from '@/lib/collab/colors'
import type { CollabIdentity } from '@/lib/collab/types'

import { facehashDataUrl } from './facehash-avatar'
import { userDisplayName } from './people'

// Test profiles are activated only by explicit setup on /dev/collab.

export const PERSONA_NAMES = [
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

export type Persona = { name: string; color: string }

function pick<T>(items: readonly T[], except?: T): T {
  const pool = items.filter(item => item !== except)
  return pool[Math.floor(Math.random() * pool.length)] ?? items[0]
}

export function randomPersona(current?: Persona): Persona {
  return {
    name: pick(PERSONA_NAMES, current?.name),
    color: pick(
      PERSONA_COLORS.map(([, hex]) => hex),
      current?.color
    )
  }
}

export function personaIdentity(id: string, persona: Persona): CollabIdentity {
  const identity = { id, name: persona.name, color: persona.color }
  const avatar = facehashDataUrl(userDisplayName(identity), persona.color)
  return { ...identity, ...(avatar ? { avatar } : {}) }
}

// The id stays with the tab through renames, so peers keep seeing one person.
export function createDevIdentity(): CollabIdentity {
  return personaIdentity(`dev-${crypto.randomUUID().slice(0, 8)}`, randomPersona())
}
