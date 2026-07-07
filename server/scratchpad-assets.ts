import { readdir, stat, unlink } from 'node:fs/promises'
import { join } from 'node:path'

import type { ScratchpadDoc } from './scratchpad'

// Scratchpad image/video bytes live as content-addressed files here, NOT as
// base64 data URLs inside `.moi/.scratchpad.json`. The snapshot is rewritten on
// every autosave (~500ms after each user edit) and shipped whole over GET/PUT,
// so a few pasted screenshots inlined as base64 would make every save and every
// tab reload carry megabytes of pixels. Instead an asset record's `src` is
// `asset:<sha256>.<ext>` — a tldraw-valid src protocol — pointing at a file in
// `.moi/.scratchpad/` (a hidden sidecar dir next to `.moi/.scratchpad.json`,
// moi-internal like the snapshot itself). The browser uploads/resolves through
// the `/scratchpad/assets` routes (see its TLAssetStore in Scratchpad.tsx); the
// server's `add image` writes files directly; `read-image` reads them back.
//
// Content addressing (the file name is the sha256 of the bytes) buys dedup —
// the same image pasted twice is one file — and makes every write idempotent,
// so re-extracting a stale tab's base64 PUT converges on the same file.

export function getScratchpadAssetsDir(workspacePath: string): string {
  return join(workspacePath, '.moi', '.scratchpad')
}

// Matches executor-side MAX_IMAGE_BYTES — the most anyone can hand us.
export const MAX_ASSET_BYTES = 50 * 1024 * 1024

const ASSET_SRC_PREFIX = 'asset:'

// The only file names we ever create or serve: `asset-<sha256 hex>.<short ext>`.
// The `asset-` prefix marks the files as canvas assets, keeping the sidecar dir
// unambiguous if it ever holds anything else. Anything else (traversal attempts
// included) is rejected at the boundary.
const ASSET_FILE_RE = /^asset-[0-9a-f]{64}\.[a-z0-9]{1,8}$/

const MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'image/avif': 'avif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov'
}
const EXT_MIME: Record<string, string> = Object.fromEntries(
  Object.entries(MIME_EXT).map(([mime, ext]) => [ext, mime])
)

// The stored file name behind an `asset:` src, or null when the src is a
// different scheme (http, data) or malformed.
export function assetSrcFileName(src: string): string | null {
  if (!src.startsWith(ASSET_SRC_PREFIX)) return null
  const name = src.slice(ASSET_SRC_PREFIX.length)
  return ASSET_FILE_RE.test(name) ? name : null
}

// A served asset file by (validated) name — the GET route and `read-image`
// resolve through this. Null for a name we'd never have written.
export function scratchpadAssetFile(
  workspacePath: string,
  fileName: string
): { file: ReturnType<typeof Bun.file>; mimeType: string } | null {
  if (!ASSET_FILE_RE.test(fileName)) return null
  const ext = fileName.slice(fileName.lastIndexOf('.') + 1)
  return {
    file: Bun.file(join(getScratchpadAssetsDir(workspacePath), fileName)),
    mimeType: EXT_MIME[ext] ?? 'application/octet-stream'
  }
}

// Persist one asset's bytes and return the `asset:` src to store on the record.
// Idempotent: identical bytes land on the same file. (Bun.write creates the
// directory tree as needed.)
export async function storeScratchpadAsset(
  workspacePath: string,
  bytes: Uint8Array,
  mimeType: string
): Promise<{ src: string }> {
  const hasher = new Bun.CryptoHasher('sha256')
  hasher.update(bytes)
  const ext = MIME_EXT[mimeType.split(';')[0].trim().toLowerCase()] ?? 'bin'
  const fileName = `asset-${hasher.digest('hex')}.${ext}`
  const path = join(getScratchpadAssetsDir(workspacePath), fileName)
  if (!(await Bun.file(path).exists())) await Bun.write(path, bytes)
  return { src: `${ASSET_SRC_PREFIX}${fileName}` }
}

// A base64 data URL on an asset record — the shape tldraw's default (inline)
// asset store produces, and what legacy snapshots hold.
const INLINE_SRC_RE = /^data:([\w.+-]+\/[\w.+-]+);base64,([A-Za-z0-9+/=]+)$/

// Rewrite every asset record whose src is an inline base64 data URL to an
// `asset:` file reference, writing the bytes out. This is the migration path
// for snapshots written before file-backed assets AND the safety net for a
// stale tab whose live store still holds base64 and PUTs it back — every
// writer funnels through saveScratchpadDoc, which calls this. Returns the same
// document when nothing needed rewriting; never throws on a malformed record
// (a bad asset is left as-is rather than blocking the save).
export async function extractInlineAssets(
  document: ScratchpadDoc,
  workspacePath: string
): Promise<ScratchpadDoc> {
  const store = document?.store
  if (!store || typeof store !== 'object') return document

  let rewritten: Record<string, unknown> | null = null
  for (const [key, record] of Object.entries(store)) {
    if (!record || typeof record !== 'object') continue
    const r = record as { typeName?: string; props?: { src?: unknown } }
    if (r.typeName !== 'asset' || typeof r.props?.src !== 'string') continue
    const m = r.props.src.match(INLINE_SRC_RE)
    if (!m) continue
    try {
      const bytes = new Uint8Array(Buffer.from(m[2], 'base64'))
      if (bytes.length === 0) continue
      const { src } = await storeScratchpadAsset(workspacePath, bytes, m[1])
      // Records off getSnapshot may be frozen — replace, don't mutate.
      rewritten ??= { ...store }
      rewritten[key] = { ...r, props: { ...r.props, src } }
    } catch {}
  }
  return rewritten ? { ...document, store: rewritten } : document
}

// Files uploaded but not yet referenced by a saved snapshot: the browser's
// TLAssetStore uploads first, and the asset record only lands on disk with the
// next autosave (~500ms-1s later). The grace keeps the sweep from eating that
// window; anything unreferenced *and* old is a genuine orphan (deleted image,
// cleared canvas, abandoned upload).
const SWEEP_GRACE_MS = 5 * 60_000

// Asset file names referenced by the schema-change backup (`.scratchpad.json.bak`
// — see backupOnSchemaChange in scratchpad.ts). The sweep must not eat those:
// the .bak is the manual escape hatch after a downgrade, and restoring it with
// its images gone would defeat the point. A raw regex scan (no JSON parse — the
// .bak may be a huge legacy file), cached by mtime since the file only changes
// on a schema upgrade. The pattern is `asset:` + ASSET_FILE_RE.
const BAK_SRC_RE = /asset:(asset-[0-9a-f]{64}\.[a-z0-9]{1,8})/g
const bakRefsCache = new Map<string, { mtimeMs: number; refs: Set<string> }>()
async function bakReferencedAssets(bakFile: string): Promise<Set<string>> {
  try {
    const { mtimeMs } = await stat(bakFile)
    const cached = bakRefsCache.get(bakFile)
    if (cached && cached.mtimeMs === mtimeMs) return cached.refs
    const refs = new Set<string>()
    for (const m of (await Bun.file(bakFile).text()).matchAll(BAK_SRC_RE)) refs.add(m[1])
    bakRefsCache.set(bakFile, { mtimeMs, refs })
    return refs
  } catch {
    return new Set()
  }
}

// Delete asset files that neither the (just-saved) document nor the snapshot's
// `.bak` backup references. Runs after every save; best-effort — a sweep
// failure must never surface into the save.
export async function sweepOrphanAssets(
  workspacePath: string,
  document: ScratchpadDoc,
  bakFile?: string
): Promise<void> {
  try {
    const dir = getScratchpadAssetsDir(workspacePath)
    const files = await readdir(dir).catch(() => [] as string[])
    if (files.length === 0) return

    const referenced = new Set<string>()
    for (const record of Object.values(document?.store ?? {})) {
      if (!record || typeof record !== 'object') continue
      const r = record as { typeName?: string; props?: { src?: unknown } }
      if (r.typeName !== 'asset' || typeof r.props?.src !== 'string') continue
      const name = assetSrcFileName(r.props.src)
      if (name) referenced.add(name)
    }
    if (bakFile) for (const name of await bakReferencedAssets(bakFile)) referenced.add(name)

    const now = Date.now()
    for (const name of files) {
      if (!ASSET_FILE_RE.test(name) || referenced.has(name)) continue
      const path = join(dir, name)
      try {
        const { mtimeMs } = await stat(path)
        if (now - mtimeMs > SWEEP_GRACE_MS) await unlink(path)
      } catch {}
    }
  } catch {}
}
