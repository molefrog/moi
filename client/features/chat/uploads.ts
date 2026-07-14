import type { UploadInfo } from '@/lib/types'

// POST one or more files to a workspace's upload endpoint and return the server's
// `UploadInfo` for each (in request order). The chat composer calls this as soon
// as files are added (drop/paste/pick) so the upload ids are ready by send time.
export async function uploadFiles(workspaceId: string, files: File[]): Promise<UploadInfo[]> {
  const form = new FormData()
  for (const f of files) form.append('files', f)
  const res = await fetch(`/api/workspaces/${workspaceId}/uploads`, {
    method: 'POST',
    body: form
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(detail || `Upload failed (${res.status})`)
  }
  return res.json()
}
