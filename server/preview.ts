// Downscaled image previews of workspace files.
//
// Backs GET /api/workspaces/:id/preview/<path>, used by the chat's expanded
// tool rows: when the agent `Read`s an image from the workspace, the row shows
// the actual picture instead of just the path. Same hard guards as the raw
// `/fs/` stream (resolveWorkspaceMediaFile), but scoped to image extensions and
// resized server-side so a huge screenshot doesn't ship megabytes to render a
// 300px-tall preview.
//
// Workspace files change under the agent, so responses are revalidated instead
// of cached blindly: ETag from (size, mtime) + `no-cache`, so an unchanged file
// costs a 304 and an edited one re-renders.
import { statSync } from 'node:fs'

import sharp from 'sharp'

import { resolveWorkspaceMediaFile } from './applets'

// Long edge of the rendered preview. 2× the ~300px display size keeps it crisp
// on retina without shipping the original.
const PREVIEW_MAX_EDGE = 800

// Everything sharp can decode gets resized + re-encoded to webp. SVG and GIF
// stream raw instead: SVG scales for free, and resizing a GIF would drop its
// animation.
const RESIZE_RE = /\.(png|jpe?g|webp|avif)$/i
const PASSTHROUGH_RE = /\.(gif|svg)$/i

export async function serveWorkspaceImagePreview(
  workspaceRoot: string,
  tail: string,
  ifNoneMatch?: string | null
): Promise<Response> {
  const resize = RESIZE_RE.test(tail)
  if (!resize && !PASSTHROUGH_RE.test(tail)) {
    return new Response('Not an image', { status: 415 })
  }
  const realTarget = resolveWorkspaceMediaFile(workspaceRoot, tail)
  if (realTarget instanceof Response) return realTarget

  let stat: ReturnType<typeof statSync>
  try {
    stat = statSync(realTarget)
  } catch {
    return new Response('Not found', { status: 404 })
  }
  const etag = `"${stat.size}-${Math.trunc(stat.mtimeMs)}${resize ? `-${PREVIEW_MAX_EDGE}` : ''}"`
  const headers: Record<string, string> = { ETag: etag, 'Cache-Control': 'private, no-cache' }
  if (ifNoneMatch === etag) return new Response(null, { status: 304, headers })

  if (!resize) {
    const file = Bun.file(realTarget)
    return new Response(file, {
      headers: { ...headers, 'Content-Type': file.type || 'application/octet-stream' }
    })
  }

  try {
    const data = await sharp(realTarget)
      .rotate()
      .resize(PREVIEW_MAX_EDGE, PREVIEW_MAX_EDGE, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer()
    return new Response(data, { headers: { ...headers, 'Content-Type': 'image/webp' } })
  } catch {
    // Undecodable (corrupt, or an unsupported codec despite the extension) —
    // there's no preview to show; the client hides the <img> on error.
    return new Response('Preview failed', { status: 415 })
  }
}
