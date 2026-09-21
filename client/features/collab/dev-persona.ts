import type { CollabIdentity } from '@/lib/collab/types'

import { facehashDataUrl } from './facehash-avatar'

// Test profiles are activated only by explicit setup on /dev/collab.

// Backgrounds that keep the black face readable and still work as a cursor
// color on light and dark surfaces.
export const PERSONA_COLORS = [
  ['Pink', '#ec4899'],
  ['Orange', '#f97316'],
  ['Amber', '#f59e0b'],
  ['Lime', '#84cc16'],
  ['Emerald', '#10b981'],
  ['Cyan', '#06b6d4'],
  ['Blue', '#3b82f6'],
  ['Violet', '#8b5cf6']
] as const

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
  const avatar = facehashDataUrl(persona.name, persona.color)
  return { id, name: persona.name, color: persona.color, ...(avatar ? { avatar } : {}) }
}

// The id stays with the tab through renames, so peers keep seeing one person.
export function createDevIdentity(): CollabIdentity {
  return personaIdentity(`dev-${crypto.randomUUID().slice(0, 8)}`, randomPersona())
}
