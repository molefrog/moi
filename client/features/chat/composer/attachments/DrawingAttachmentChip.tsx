import { IconScribble } from '@tabler/icons-react'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/client/components/ui/hover-card'
import type { StagedAttachment } from './types'
import { AttachmentChip } from './AttachmentChip'

type DrawingAttachmentChipProps = {
  attachment: Extract<StagedAttachment, { kind: 'drawing' }>
  onRemove: () => void
}

export function DrawingAttachmentChip({ attachment, onRemove }: DrawingAttachmentChipProps) {
  const { previewUrl, purpose } = attachment
  const label = purpose === 'sketch' ? 'Sketch' : 'Annotation'

  return (
    <HoverCard>
      <HoverCardTrigger
        render={
          <AttachmentChip tabIndex={0} label={label} icon={IconScribble} onRemove={onRemove} />
        }
      />
      {previewUrl && (
        <HoverCardContent
          side="top"
          align="start"
          className="w-60 max-w-[calc(100vw-2rem)] rounded-xl"
        >
          <img
            src={previewUrl}
            alt={`${label} preview`}
            className="max-h-72 w-full rounded-md object-contain"
          />
        </HoverCardContent>
      )}
    </HoverCard>
  )
}
