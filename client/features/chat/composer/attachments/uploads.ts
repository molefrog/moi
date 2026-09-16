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

export async function uploadWorkspaceFile(workspaceId: string, path: string): Promise<UploadInfo> {
  const res = await fetch(`/api/workspaces/${workspaceId}/uploads/from-path`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path })
  })
  if (!res.ok) throw new Error(await res.text().catch(() => `Upload failed (${res.status})`))
  return res.json()
}

// Shared preparation for draft attachments and immediate applet sends.
export async function uploadChatFile(
  workspaceId: string,
  input: File | string
): Promise<UploadInfo> {
  const upload =
    typeof input === 'string'
      ? await uploadWorkspaceFile(workspaceId, input)
      : (await uploadFiles(workspaceId, [input]))[0]
  if (!upload) throw new Error('Upload returned no file')
  return upload
}
