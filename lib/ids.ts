import { customAlphabet } from 'nanoid'

// Short, shell- and URL-safe ids: base36 (0-9a-z), no dashes — so an id never
// looks like a CLI flag or reads oddly in a URL.
const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz'

// Workspace ids live in `/workspace/<id>` URLs and persist for the workspace's
// whole life. 10 chars (~52 bits) stays collision-free at any realistic count.
export const newWorkspaceId = customAlphabet(ALPHABET, 10)

// Builder handles are copied onto the command line (`moi builder set …
// --builder <id>`), and only need to be unique among a workspace's handful of
// builders — so 6 chars (~31 bits) keeps the command short while staying
// collision-free at that scale.
export const newBuilderId = customAlphabet(ALPHABET, 6)
