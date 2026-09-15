import { IconLibrary } from '@tabler/icons-react'
import { AttachmentChip } from './AttachmentChip'

type ContextAttachmentChipProps = {
  label: string
  onRemove?: () => void
}

export function ContextAttachmentChip({ label, onRemove }: ContextAttachmentChipProps) {
  return <AttachmentChip label={label} icon={IconLibrary} onRemove={onRemove} />
}
