import { IconFile } from '@tabler/icons-react'
import type { StagedAttachment } from './types'
import { AttachmentChip } from './AttachmentChip'

type FileAttachmentChipProps = {
  attachment: Extract<StagedAttachment, { kind: 'file' }>
  onRemove: () => void
}

export function FileAttachmentChip({ attachment, onRemove }: FileAttachmentChipProps) {
  return (
    <AttachmentChip
      label={attachment.label}
      icon={IconFile}
      onRemove={onRemove}
      previewUrl={attachment.previewUrl}
      loading={attachment.status === 'uploading'}
      title={attachment.label}
      className="max-w-52"
    />
  )
}
