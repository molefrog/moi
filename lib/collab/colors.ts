// The eight Tailwind palette names available for users. Their shades live in CSS.
export const USER_COLORS = [
  'pink',
  'orange',
  'amber',
  'lime',
  'emerald',
  'cyan',
  'blue',
  'violet'
] as const
export type UserColor = (typeof USER_COLORS)[number]

export function isUserColor(value: unknown): value is UserColor {
  return typeof value === 'string' && (USER_COLORS as readonly string[]).includes(value)
}

// A random-looking but stable pick (FNV-1a), so a user id gets the same color
// on the server and in every browser.
export function colorForId(id: string): UserColor {
  let hash = 0x811c9dc5
  for (let index = 0; index < id.length; index++) {
    hash ^= id.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return USER_COLORS[(hash >>> 0) % USER_COLORS.length] ?? USER_COLORS[0]
}
