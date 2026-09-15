import { IconFile } from '@tabler/icons-react'
import type { ChatAttachment } from './types'
import { AttachmentChip } from './AttachmentChip'

type FileAttachmentChipProps = {
  attachment: Extract<ChatAttachment, { kind: 'file' }>
  onRemove: () => void
}

export function FileAttachmentChip({ attachment, onRemove }: FileAttachmentChipProps) {
  return (
    <AttachmentChip
      label={attachment.name}
      icon={IconFile}
      onRemove={onRemove}
      previewUrl={attachment.previewUrl}
      status={attachment.status}
      title={attachment.error ?? attachment.name}
      className="max-w-52"
    />
  )
}
