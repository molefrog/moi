// Backgrounds that keep the black face readable and still work as a cursor
// color on light and dark surfaces.
export const USER_COLORS = [
  ['Pink', '#ec4899'],
  ['Orange', '#f97316'],
  ['Amber', '#f59e0b'],
  ['Lime', '#84cc16'],
  ['Emerald', '#10b981'],
  ['Cyan', '#06b6d4'],
  ['Blue', '#3b82f6'],
  ['Violet', '#8b5cf6']
] as const

// A random-looking but stable pick (FNV-1a), so a user id gets the same color
// on the server and in every browser.
export function colorForId(id: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < id.length; index++) {
    hash ^= id.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  const [, color] = USER_COLORS[(hash >>> 0) % USER_COLORS.length] ?? USER_COLORS[0]
  return color
}
