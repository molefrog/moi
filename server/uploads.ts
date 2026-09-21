// In-memory store for chat attachments uploaded ahead of a message.
//
// Flow: the client POSTs files to /api/workspaces/:id/uploads *before* (or while
// composing) a chat message; we process them here and hand back a lightweight
// `UploadInfo` with an opaque `id`. The chat WS frame then references those ids,
// and `cc-session` resolves them back to bytes when it builds the agent message.
//
// Why a store and not base64-over-the-WS: keeps chat frames small (a 4 MB
// screenshot would otherwise bloat every broadcast), lets us downscale images
// with sharp once at upload time, and gives the agent a real file path for
// non-image attachments. Entries are evicted on a TTL so unsent uploads don't
// leak — the bytes are short-lived; once the agent message is built the durable
// copy is the base64 block the SDK persists to the session `.jsonl`.
import { mkdir, open, realpath, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, relative, resolve, sep } from 'node:path'
import { isWorkspaceAttachmentPath, MAX_UPLOAD_BYTES } from '@/lib/message-attachments'

import sharp from 'sharp'

import type { Part } from '@/lib/format'
import type { UploadInfo } from '@/lib/types'

// Media types Claude vision accepts directly. Anything else that is still an
// image gets transcoded to PNG; non-images are delivered as a file path.
const VISION_MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])

// Anthropic recommends a long edge <= 1568px for the best cost/latency without
// quality loss — larger images are downscaled to fit. GIFs pass through (sharp
// animation handling is heavier and rarely needed for attachments).
const MAX_IMAGE_EDGE = 1568
// Per-file ceiling for the raw upload (post-resize images are far smaller).
export { MAX_UPLOAD_BYTES } from '@/lib/message-attachments'
const TTL_MS = 30 * 60_000

export type StoredUpload = UploadInfo & {
  workspaceId: string
  // For images: the (possibly transcoded/resized) bytes, base64-inlined into the
  // agent message. For files: undefined — see `path`.
  data?: Buffer
  // For non-image files: an absolute temp path the agent can `Read`.
  path?: string
  createdAt: number
}

// Keyed `${workspaceId}:${id}` so identical bytes uploaded from two workspaces
// never share (or steal) an entry — resolve stays strictly workspace-scoped.
const uploads = new Map<string, StoredUpload>()

function storeKey(workspaceId: string, id: string): string {
  return `${workspaceId}:${id}`
}

function evictExpired() {
  const now = Date.now()
  for (const [key, u] of uploads) {
    if (now - u.createdAt > TTL_MS) uploads.delete(key)
  }
}

// Content-address the upload: the id is the sha256 of the *processed* bytes, so
// a re-pasted identical image resolves to the same entry (dedup) and the served
// URL is immutable for the entry's lifetime. Non-images mix the filename in —
// same bytes under two names should stay two entries (each gets its own temp
// path named after the file).
function contentId(data: Buffer, filename?: string): string {
  const hasher = new Bun.CryptoHasher('sha256')
  hasher.update(data)
  if (filename !== undefined) hasher.update(`\0${filename}`)
  return hasher.digest('hex')
}

// Insert-or-refresh under the content-addressed key. On a dedup hit the
// existing entry just gets its TTL bumped (the bytes are identical by
// construction), so pending messages referencing the id stay valid.
function upsert(stored: StoredUpload): StoredUpload {
  const key = storeKey(stored.workspaceId, stored.id)
  const existing = uploads.get(key)
  if (existing) {
    existing.createdAt = Date.now()
    return existing
  }
  uploads.set(key, stored)
  return stored
}

function sanitizeFilename(name: string): string {
  // Strip path separators and control chars; keep it human-readable for the
  // temp filename and the display label.
  const base = name.split(/[\\/]/).pop() ?? 'file'
  return base.replace(/[^\w.\-() ]+/g, '_').slice(0, 200) || 'file'
}

// Process one uploaded file into a StoredUpload. Images are normalized to a
// vision-safe media type and downscaled; everything else is written to a temp
// file the agent can open.
export async function addUpload(input: {
  workspaceId: string
  filename: string
  mediaType: string
  bytes: Buffer
}): Promise<UploadInfo> {
  evictExpired()
  const filename = sanitizeFilename(input.filename)
  const isImage = input.mediaType.startsWith('image/')

  if (isImage && input.mediaType !== 'image/gif') {
    // Resize to fit MAX_IMAGE_EDGE and re-encode. Keep the format when it's
    // vision-safe; otherwise (heic, avif, bmp, …) transcode to PNG.
    const keepFormat = VISION_MEDIA_TYPES.has(input.mediaType)
    const pipeline = sharp(input.bytes).rotate().resize(MAX_IMAGE_EDGE, MAX_IMAGE_EDGE, {
      fit: 'inside',
      withoutEnlargement: true
    })
    const out = keepFormat ? pipeline : pipeline.png()
    const { data, info } = await out.toBuffer({ resolveWithObject: true })
    const mediaType = keepFormat ? input.mediaType : 'image/png'
    const stored = upsert({
      id: contentId(data),
      workspaceId: input.workspaceId,
      kind: 'image',
      mediaType,
      filename,
      size: data.byteLength,
      width: info.width,
      height: info.height,
      data,
      createdAt: Date.now()
    })
    return toInfo(stored)
  }

  if (input.mediaType === 'image/gif') {
    const meta = await sharp(input.bytes)
      .metadata()
      .catch(() => null)
    const stored = upsert({
      id: contentId(input.bytes),
      workspaceId: input.workspaceId,
      kind: 'image',
      mediaType: 'image/gif',
      filename,
      size: input.bytes.byteLength,
      width: meta?.width,
      height: meta?.height,
      data: input.bytes,
      createdAt: Date.now()
    })
    return toInfo(stored)
  }

  // Non-image: persist to a temp file and reference it by path. The agent reads
  // it with its Read tool; we don't inline arbitrary file bytes into the prompt.
  const id = contentId(input.bytes, filename)
  const dir = join(tmpdir(), 'moi-uploads', id)
  await mkdir(dir, { recursive: true })
  const path = join(dir, filename)
  await writeFile(path, input.bytes)
  const stored = upsert({
    id,
    workspaceId: input.workspaceId,
    kind: 'file',
    mediaType: input.mediaType || 'application/octet-stream',
    filename,
    size: input.bytes.byteLength,
    path,
    createdAt: Date.now()
  })
  return toInfo(stored)
}

// Snapshot a workspace file into the same store used by browser uploads.
export async function addWorkspaceFileUpload(
  workspaceId: string,
  workspaceRoot: string,
  path: string
): Promise<UploadInfo> {
  if (!isWorkspaceAttachmentPath(path)) throw new Error('Invalid workspace file path')
  const root = await realpath(workspaceRoot)
  const target = await realpath(resolve(root, path))
  const rel = relative(root, target).split(sep).join('/')
  // Check the resolved path too: aliases must not expose hidden files or escape.
  if (!isWorkspaceAttachmentPath(rel))
    throw new Error('File must be inside the workspace and outside hidden folders')
  const file = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    const stat = await file.stat()
    if (!stat.isFile()) throw new Error('Expected a regular file')
    if (stat.size > MAX_UPLOAD_BYTES) throw new Error('File is too large (max 32 MB)')
    // Bound the read even if the file grows after stat. One extra byte detects overflow.
    const bytes = Buffer.alloc(Math.min(stat.size + 1, MAX_UPLOAD_BYTES + 1))
    let size = 0
    while (size < bytes.length) {
      const read = await file.read(bytes, size, bytes.length - size, null)
      if (read.bytesRead === 0) break
      size += read.bytesRead
    }
    if (size > stat.size) throw new Error('File changed while attaching; try again')
    return await addUpload({
      workspaceId,
      filename: basename(path),
      mediaType: Bun.file(path).type || 'application/octet-stream',
      bytes: bytes.subarray(0, size)
    })
  } finally {
    await file.close()
  }
}

function toInfo(u: StoredUpload): UploadInfo {
  return {
    id: u.id,
    kind: u.kind,
    mediaType: u.mediaType,
    filename: u.filename,
    size: u.size,
    ...(u.width != null ? { width: u.width } : {}),
    ...(u.height != null ? { height: u.height } : {})
  }
}

// Resolve upload ids to their stored records (skipping unknown/expired ids and
// any that don't belong to the workspace). Order follows the input ids. Each
// hit refreshes its TTL — a message referencing the upload keeps it servable.
export function resolveUploads(workspaceId: string, ids: string[]): StoredUpload[] {
  evictExpired()
  const out: StoredUpload[] = []
  for (const id of ids) {
    const u = uploads.get(storeKey(workspaceId, id))
    if (u) {
      u.createdAt = Date.now()
      out.push(u)
    }
  }
  return out
}

// One upload by id (workspace-scoped), for the GET serving route. Touching the
// TTL on read keeps an image that a live tab is still displaying alive.
export function getUpload(workspaceId: string, id: string): StoredUpload | null {
  evictExpired()
  const u = uploads.get(storeKey(workspaceId, id))
  if (u) u.createdAt = Date.now()
  return u ?? null
}

// Ensure an upload exists as a real file on disk and return its absolute path.
// Images live in memory by default (they're inlined as base64 for Claude); some
// adapters (e.g. OpenClaw, whose gateway only accepts a string message) need a
// path instead, so we lazily write the bytes out here.
export async function materializeToPath(u: StoredUpload): Promise<string | null> {
  if (u.path) return u.path
  if (!u.data) return null
  const dir = join(tmpdir(), 'moi-uploads', u.id)
  await mkdir(dir, { recursive: true })
  const path = join(dir, u.filename)
  await writeFile(path, u.data)
  u.path = path
  return path
}

// A base64 data URL for an image upload — the inline source shape the adapter
// also reconstructs from a persisted `.jsonl` message on cold reload.
export function uploadDataUrl(u: StoredUpload): string | null {
  if (!u.data) return null
  return `data:${u.mediaType};base64,${u.data.toString('base64')}`
}

// The URL GET /api/workspaces/:id/uploads/:uploadId serves this upload at.
export function servedUploadUrl(u: StoredUpload): string {
  return `/api/workspaces/${encodeURIComponent(u.workspaceId)}/uploads/${u.id}`
}

// The display `Part` for one upload — an image thumbnail or a labelled file
// chip. Points at the served URL, NOT a data URL: base64 must never travel over
// the WS broadcast or sit in the client cache (see dev/file-uploads.md). Cold
// reloads fall back to the data URL the adapter rebuilds from the `.jsonl`.
export function uploadToDisplayPart(u: StoredUpload): Part | null {
  return {
    type: 'file-attachment',
    mediaType: u.mediaType,
    label: u.filename,
    previewUrl: u.kind === 'image' ? servedUploadUrl(u) : undefined,
    path: u.kind === 'file' ? u.path : undefined
  }
}
