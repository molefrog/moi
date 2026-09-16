import { IconLibrary } from '@tabler/icons-react'
import { AttachmentChip } from './AttachmentChip'

type TextAttachmentChipProps = {
  label: string
  onRemove?: () => void
}

export function TextAttachmentChip({ label, onRemove }: TextAttachmentChipProps) {
  return <AttachmentChip label={label} icon={IconLibrary} onRemove={onRemove} />
}
