import type { ComponentPropsWithRef } from 'react'
import { IconLoader2, IconX, type Icon } from '@tabler/icons-react'
import { Button } from '@/client/components/ui/button'
import { cn } from '@/client/lib/cn'

type AttachmentChipProps = ComponentPropsWithRef<'div'> & {
  label: string
  icon: Icon
  onRemove?: () => void
  previewUrl?: string
  status?: 'draft' | 'uploading' | 'ready' | 'error'
}

// Two layouts share one frame: a labelled chip or an image thumbnail.
// Upload status is an overlay; it doesn't introduce another layout.
export function AttachmentChip({
  label,
  icon,
  onRemove,
  previewUrl,
  status,
  className,
  children,
  ...props
}: AttachmentChipProps) {
  return (
    <div
      title={label}
      {...props}
      className={cn(
        'group relative flex max-w-full min-w-0 cursor-default items-center rounded-md bg-background text-sm whitespace-nowrap text-foreground ring-1 ring-border outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        previewUrl ? 'size-14 overflow-hidden' : 'h-7 pr-2 pl-0.5',
        status === 'error' && 'ring-destructive/50',
        className
      )}
    >
      {previewUrl ? (
        <ImageChipContent
          label={label}
          previewUrl={previewUrl}
          onRemove={onRemove}
          status={status}
        />
      ) : (
        <LabelChipContent label={label} icon={icon} onRemove={onRemove} status={status} />
      )}
      {children}
    </div>
  )
}

type LabelChipContentProps = Pick<AttachmentChipProps, 'label' | 'icon' | 'onRemove' | 'status'>

function LabelChipContent({ label, icon: IconComponent, onRemove, status }: LabelChipContentProps) {
  return (
    <>
      {onRemove ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onRemove}
          aria-label={`Remove ${label}`}
          className="size-6 shrink-0 hover:bg-transparent hover:text-current"
        >
          <IconComponent stroke={1.75} className="group-focus-within:hidden group-hover:hidden" />
          <IconX stroke={1.75} className="hidden group-focus-within:block group-hover:block" />
        </Button>
      ) : (
        <span className="flex size-6 shrink-0 items-center justify-center">
          <IconComponent size={16} stroke={1.75} />
        </span>
      )}
      <span className="truncate">{label}</span>
      <ChipUploadStatus status={status} />
    </>
  )
}

type ImageChipContentProps = Pick<AttachmentChipProps, 'label' | 'onRemove' | 'status'> & {
  previewUrl: string
}

function ImageChipContent({ label, previewUrl, onRemove, status }: ImageChipContentProps) {
  return (
    <>
      <img src={previewUrl} alt={label} className="size-full object-cover" />
      <ChipUploadStatus status={status} />
      {onRemove && (
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          onClick={onRemove}
          aria-label={`Remove ${label}`}
          className="absolute top-1 right-1 size-4 rounded-xs border-0 opacity-0 shadow-xs transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 [&_svg]:size-3"
        >
          <IconX stroke={1.75} />
        </Button>
      )}
    </>
  )
}

type ChipUploadStatusProps = Pick<AttachmentChipProps, 'status'>

function ChipUploadStatus({ status }: ChipUploadStatusProps) {
  if (status === 'uploading') {
    return (
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/70">
        <IconLoader2 size={16} stroke={1.75} className="animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (status === 'error') {
    return (
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-destructive/10 text-[10px] text-destructive">
        Failed
      </div>
    )
  }
  return null
}
