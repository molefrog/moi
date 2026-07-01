import { useState } from 'react'

import { useWorkspaceId } from '@/client/lib/WorkspaceContext'
import type { ToolCall } from '@/lib/types'

// Image extensions the server's preview route can render (see server/preview.ts).
const IMAGE_PATH_RE = /\.(png|jpe?g|gif|webp|avif|svg)$/i

// When the agent `Read`s an image that lives inside the workspace, return its
// workspace-relative path so the expanded row can show the actual picture.
// Anything else — non-Read tools, non-image paths, files outside the workspace
// (the preview route can only serve workspace files) — returns null.
export function readImageRelPath(call: ToolCall, cwd: string | null): string | null {
  if (call.name !== 'Read' || !cwd) return null
  const input = call.input as { file_path?: unknown }
  const p = typeof input.file_path === 'string' ? input.file_path : null
  if (!p || !IMAGE_PATH_RE.test(p)) return null
  const root = cwd.endsWith('/') ? cwd : `${cwd}/`
  if (!p.startsWith(root)) return null
  return p.slice(root.length)
}

type ReadImagePreviewProps = { relPath: string }

// The picture a Read tool call opened, loaded on demand from the workspace via
// the preview route (server-side downscaled). The file can be gone or
// undecodable by the time the row is expanded — on any load error the preview
// just disappears, leaving the normal output view.
export function ReadImagePreview({ relPath }: ReadImagePreviewProps) {
  const workspaceId = useWorkspaceId()
  const [failed, setFailed] = useState(false)
  if (failed) return null
  const src = `/api/workspaces/${workspaceId}/preview/${relPath
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`
  return (
    <img
      src={src}
      alt={relPath}
      loading="lazy"
      onError={() => setFailed(true)}
      className="max-h-64 max-w-full self-start rounded-md border border-border object-contain"
    />
  )
}
