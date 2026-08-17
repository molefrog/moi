import { customAlphabet } from 'nanoid'

// Short, shell- and URL-safe ids: base36 (0-9a-z), no dashes — so an id never
// looks like a CLI flag or reads oddly in a URL.
const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz'

// Workspace ids live in `/workspace/<id>` URLs and persist for the workspace's
// whole life. 10 chars (~52 bits) stays collision-free at any realistic count.
export const newWorkspaceId = customAlphabet(ALPHABET, 10)

// Ids may also be chosen by hand (`moi init --id <id>`), so they are validated
// rather than assumed. Slightly wider than the generated alphabet — dashes and
// underscores read well in a URL — but never leading with a dash, so an id
// cannot be mistaken for a CLI flag.
export function validateWorkspaceId(id: string): string | null {
  if (!id) return 'Workspace id is required'
  if (id.length > 64) return 'Workspace id is too long (max 64 characters)'
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(id)) {
    return 'Use letters, numbers, dashes and underscores, starting with a letter or number'
  }
  return null
}

// Builder handles are copied onto the command line (`moi builder set …
// --builder <id>`), and only need to be unique among a workspace's handful of
// builders — so 6 chars (~31 bits) keeps the command short while staying
// collision-free at that scale.
export const newBuilderId = customAlphabet(ALPHABET, 6)
