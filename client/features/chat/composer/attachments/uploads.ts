import { jsonRequest, requestJson } from '@/client/api/http'
import type { UploadInfo } from '@/lib/types'

// Shared single-file preparation for drafts, drawings, and immediate sends.
export async function uploadChatFile(
  workspaceId: string,
  input: File | string
): Promise<UploadInfo> {
  const url = `/api/workspaces/${workspaceId}/uploads`
  if (typeof input === 'string') {
    return requestJson<UploadInfo>(
      `${url}/from-path`,
      jsonRequest('POST', { path: input }),
      'Upload failed'
    )
  }
  const form = new FormData()
  form.append('files', input)
  const [upload] = await requestJson<UploadInfo[]>(
    url,
    { method: 'POST', body: form },
    'Upload failed'
  )
  if (!upload) throw new Error('Upload returned no file')
  return upload
}
