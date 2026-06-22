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
import { mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import sharp from 'sharp'

import type { Part } from '@/lib/format'
import type { UploadInfo, UploadKind } from '@/lib/types'

// Media types Claude vision accepts directly. Anything else that is still an
// image gets transcoded to PNG; non-images are delivered as a file path.
const VISION_MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])

// Anthropic recommends a long edge <= 1568px for the best cost/latency without
// quality loss — larger images are downscaled to fit. GIFs pass through (sharp
// animation handling is heavier and rarely needed for attachments).
const MAX_IMAGE_EDGE = 1568
// Per-file ceiling for the raw upload (post-resize images are far smaller).
export const MAX_UPLOAD_BYTES = 32 * 1024 * 1024
const TTL_MS = 30 * 60_000

export type StoredUpload = {
  id: string
  workspaceId: string
  kind: UploadKind
  mediaType: string
  filename: string
  size: number
  width?: number
  height?: number
  // For images: the (possibly transcoded/resized) bytes, base64-inlined into the
  // agent message. For files: undefined — see `path`.
  data?: Buffer
  // For non-image files: an absolute temp path the agent can `Read`.
  path?: string
  createdAt: number
}

const uploads = new Map<string, StoredUpload>()

function evictExpired() {
  const now = Date.now()
  for (const [id, u] of uploads) {
    if (now - u.createdAt > TTL_MS) uploads.delete(id)
  }
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
  const id = crypto.randomUUID()
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
    const stored: StoredUpload = {
      id,
      workspaceId: input.workspaceId,
      kind: 'image',
      mediaType,
      filename,
      size: data.byteLength,
      width: info.width,
      height: info.height,
      data,
      createdAt: Date.now()
    }
    uploads.set(id, stored)
    return toInfo(stored)
  }

  if (input.mediaType === 'image/gif') {
    const meta = await sharp(input.bytes)
      .metadata()
      .catch(() => null)
    const stored: StoredUpload = {
      id,
      workspaceId: input.workspaceId,
      kind: 'image',
      mediaType: 'image/gif',
      filename,
      size: input.bytes.byteLength,
      width: meta?.width,
      height: meta?.height,
      data: input.bytes,
      createdAt: Date.now()
    }
    uploads.set(id, stored)
    return toInfo(stored)
  }

  // Non-image: persist to a temp file and reference it by path. The agent reads
  // it with its Read tool; we don't inline arbitrary file bytes into the prompt.
  const dir = join(tmpdir(), 'moi-uploads', id)
  await mkdir(dir, { recursive: true })
  const path = join(dir, filename)
  await writeFile(path, input.bytes)
  const stored: StoredUpload = {
    id,
    workspaceId: input.workspaceId,
    kind: 'file',
    mediaType: input.mediaType || 'application/octet-stream',
    filename,
    size: input.bytes.byteLength,
    path,
    createdAt: Date.now()
  }
  uploads.set(id, stored)
  return toInfo(stored)
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
// any that don't belong to the workspace). Order follows the input ids.
export function resolveUploads(workspaceId: string, ids: string[]): StoredUpload[] {
  evictExpired()
  const out: StoredUpload[] = []
  for (const id of ids) {
    const u = uploads.get(id)
    if (u && u.workspaceId === workspaceId) out.push(u)
  }
  return out
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

// A base64 data URL for an image upload, used both for live display (the user
// turn we broadcast) and as the inline source for the agent message.
export function uploadDataUrl(u: StoredUpload): string | null {
  if (!u.data) return null
  return `data:${u.mediaType};base64,${u.data.toString('base64')}`
}

// The display `Part` for one upload — an inline image thumbnail (data URL) or a
// labelled file chip. Mirrors what the adapter reconstructs from a persisted
// message, so live and reloaded transcripts render identically.
export function uploadToDisplayPart(u: StoredUpload): Part | null {
  if (u.kind === 'image') {
    const url = uploadDataUrl(u)
    if (!url) return null
    return { type: 'file', mediaType: u.mediaType, url, filename: u.filename }
  }
  // Non-image: a chip pointing at the temp path (no inline bytes).
  return { type: 'file', mediaType: u.mediaType, url: u.path ?? '', filename: u.filename }
}
