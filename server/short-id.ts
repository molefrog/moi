import { customAlphabet } from 'nanoid'

// A short, shell- and URL-safe id: 10 chars of base36 (no dashes, so it never
// looks like a CLI flag or reads oddly in a URL). Used for view-builder handles
// and workspace ids — a user only ever has a handful of each, so the collision
// headroom is ample while the ids stay short in `moi builder set … --builder
// <id>` and in `/workspace/<id>`.
export const shortId = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 10)
