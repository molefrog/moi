import { customAlphabet } from 'nanoid'

// Short, shell- and URL-safe ids: base36 (0-9a-z), no dashes — so an id never
// looks like a CLI flag or reads oddly in a URL.
const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz'

// Workspace ids live in `/workspace/<id>` URLs and persist for the workspace's
// whole life. 10 chars (~52 bits) stays collision-free at any realistic count.
export const newWorkspaceId = customAlphabet(ALPHABET, 10)

// Ids no workspace can hold, because a URL carrying one never reaches it:
// `/api/workspaces/:id` is registered after the literal collection routes, so
// `create`, `discover` and `order` match those instead, and `ws` is claimed by
// the live-event WebSocket upgrade in `server/web.ts` before Hono sees the
// request. A workspace registered under one of these would persist fine and
// then be unreachable in the app. `server/api-reserved-ids.test.ts` re-derives
// this list from the router so a new collection route cannot outgrow it.
export const RESERVED_WORKSPACE_IDS = ['create', 'discover', 'order', 'ws']

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
  // Case-insensitive: only the exact-case spelling collides with a route, but
  // accepting `Create` while refusing `create` reads as a bug, not a rule.
  if (RESERVED_WORKSPACE_IDS.includes(id.toLowerCase())) {
    return `Workspace id ${id} is reserved (${RESERVED_WORKSPACE_IDS.join(', ')})`
  }
  return null
}

// Builder handles are copied onto the command line (`moi builder set …
// --builder <id>`), and only need to be unique among a workspace's handful of
// builders — so 6 chars (~31 bits) keeps the command short while staying
// collision-free at that scale.
export const newBuilderId = customAlphabet(ALPHABET, 6)
