// Applet thumbnail store: `.moi/.cache/thumbnails/` holds one image file per
// captured applet plus an `index.json` of freshness records. Kept out of
// `.workspace.json` on purpose — images are heavy, machine-local derived state,
// and the layout file is meant to be small and shareable. Everything here is
// re-creatable by opening the workspace in a browser, so `.moi/.cache` is safe
// to delete (and to gitignore) wholesale.
import { mkdir, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'

import type { AppletKind, AppletThumbnail, AppletThumbnailBatch } from '@/lib/types'

// Index records carry the image file name (`widget-clock.webp`) so existence
// and content type never need an fs probe. Server-internal — the API strips it.
type StoredAppletThumbnail = AppletThumbnail & { file?: string }

const INDEX_FILE = 'index.json'

const DATA_URL_RE = /^data:(image\/(?:webp|png|jpeg));base64,([A-Za-z0-9+/=]+)$/

const EXT_BY_MIME: Record<string, string> = {
  'image/webp': 'webp',
  'image/png': 'png',
  'image/jpeg': 'jpg'
}

const MIME_BY_EXT: Record<string, string> = {
  webp: 'image/webp',
  png: 'image/png',
  jpg: 'image/jpeg'
}

export function getThumbnailsDir(workspacePath: string): string {
  return join(workspacePath, '.moi', '.cache', 'thumbnails')
}

async function loadIndex(dir: string): Promise<StoredAppletThumbnail[]> {
  try {
    const parsed: unknown = JSON.parse(await Bun.file(join(dir, INDEX_FILE)).text())
    if (Array.isArray(parsed)) return parsed as StoredAppletThumbnail[]
  } catch {}
  return []
}

// Write through a temp sibling + atomic rename so a crash mid-write never
// leaves a truncated index or image (same recipe as scratchpad assets).
async function writeAtomic(dir: string, name: string, data: string | Uint8Array): Promise<void> {
  const tmp = join(dir, `.tmp-${crypto.randomUUID()}`)
  await Bun.write(tmp, data)
  await rename(tmp, join(dir, name))
}

async function saveIndex(dir: string, records: StoredAppletThumbnail[]): Promise<void> {
  await writeAtomic(dir, INDEX_FILE, JSON.stringify(records, null, 2))
}

export async function getAppletThumbnailRecords(workspacePath: string): Promise<AppletThumbnail[]> {
  const records = await loadIndex(getThumbnailsDir(workspacePath))
  return records.map(({ file: _file, ...record }) => record)
}

// The widget and view capture passes can land concurrently; serialize the
// read-modify-write per workspace so neither batch clobbers the other's index.
const saveQueues = new Map<string, Promise<void>>()

function enqueue(workspacePath: string, task: () => Promise<void>): Promise<void> {
  const next = (saveQueues.get(workspacePath) ?? Promise.resolve()).then(task, task)
  saveQueues.set(workspacePath, next)
  return next
}

// Merge a settled capture batch into the store. A data-URL image replaces the
// applet's file, null records a failed or skipped attempt while keeping any
// previous file, and an omitted image only updates visit recency.
export function saveAppletThumbnails(
  workspacePath: string,
  kind: AppletKind,
  updates: AppletThumbnailBatch['thumbnails']
): Promise<void> {
  return enqueue(workspacePath, async () => {
    const dir = getThumbnailsDir(workspacePath)
    await mkdir(dir, { recursive: true })
    const now = new Date().toISOString()
    const records = await loadIndex(dir)

    for (const update of updates) {
      const index = records.findIndex(record => record.kind === kind && record.id === update.id)
      const previous = index >= 0 ? records[index] : undefined

      if (update.image === undefined) {
        if (previous) records[index] = { ...previous, viewedAt: now }
        continue
      }

      let file = previous?.file
      if (typeof update.image === 'string') {
        const parsed = DATA_URL_RE.exec(update.image)
        if (!parsed) continue
        const next = `${kind}-${update.id}.${EXT_BY_MIME[parsed[1]]}`
        await writeAtomic(dir, next, Buffer.from(parsed[2], 'base64'))
        if (previous?.file && previous.file !== next) {
          await rm(join(dir, previous.file), { force: true }).catch(() => {})
        }
        file = next
      }

      const record: StoredAppletThumbnail = {
        kind,
        id: update.id,
        revision: update.revision,
        capturedAt: now,
        viewedAt: now,
        ...(update.captureMs !== undefined && { captureMs: update.captureMs }),
        ...(file !== undefined && { file })
      }
      if (previous) records[index] = record
      else records.push(record)
    }

    await saveIndex(dir, records)
  })
}

// Drop records (and their image files) for applets of `kind` that no longer
// exist. Called from the build pipeline beside the stale-bundle prune, so a
// deleted applet's thumbnail dies with its bundle.
export function pruneAppletThumbnails(
  workspacePath: string,
  kind: AppletKind,
  keepIds: readonly string[]
): Promise<void> {
  return enqueue(workspacePath, async () => {
    const dir = getThumbnailsDir(workspacePath)
    const records = await loadIndex(dir)
    const keep = new Set(keepIds)
    const stale = records.filter(record => record.kind === kind && !keep.has(record.id))
    if (stale.length === 0) return
    for (const record of stale) {
      if (record.file) await rm(join(dir, record.file), { force: true }).catch(() => {})
    }
    await saveIndex(
      dir,
      records.filter(record => !stale.includes(record))
    )
  })
}

// Records that actually have an image on disk, for the home-card preview.
export async function getCapturedThumbnails(
  workspacePath: string
): Promise<{ kind: AppletKind; id: string; viewedAt: string }[]> {
  const records = await loadIndex(getThumbnailsDir(workspacePath))
  return records
    .filter(record => record.file !== undefined)
    .map(({ kind, id, viewedAt }) => ({ kind, id, viewedAt }))
}

// One thumbnail image. Same caching story as applet bundles: strong ETag from
// size+mtime with `private, no-cache`, so an unchanged file costs a bodyless
// 304 and a re-capture busts every consumer on the next revalidation.
export async function serveAppletThumbnail(
  workspacePath: string,
  kind: AppletKind,
  id: string,
  ifNoneMatch?: string | null
): Promise<Response> {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) return new Response('Invalid id', { status: 400 })
  const dir = getThumbnailsDir(workspacePath)
  const records = await loadIndex(dir)
  const record = records.find(item => item.kind === kind && item.id === id)
  if (!record?.file) return new Response('Not found', { status: 404 })
  const file = Bun.file(join(dir, record.file))
  if (!(await file.exists())) return new Response('Not found', { status: 404 })

  const etag = `"${file.size}-${Math.trunc(file.lastModified)}"`
  const headers = {
    ETag: etag,
    'Cache-Control': 'private, no-cache',
    'Content-Type': MIME_BY_EXT[record.file.split('.').pop() ?? ''] ?? 'application/octet-stream'
  }
  if (ifNoneMatch === etag) return new Response(null, { status: 304, headers })
  return new Response(file, { headers })
}
