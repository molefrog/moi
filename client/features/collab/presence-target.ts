// Encode whole IDs before joining them, so a slash inside an ID cannot become
// a group boundary. React-generated IDs never form part of shared targets.
export function presenceTarget(...ids: string[]): string {
  if (!ids.length || ids.some(id => typeof id !== 'string' || !id.trim())) {
    throw new Error(
      'PresenceGroup, PresenceFrame, PresenceGutter, and Selection require a nonempty id.'
    )
  }
  return ids.map(id => encodeURIComponent(id)).join('/')
}
