import { IconX } from '@tabler/icons-react'

import { Button } from '@/client/components/ui/button'

import { ComposerBannerShell } from './ComposerBanner'

type ChatErrorBannerProps = {
  error: string
  onDismiss: () => void
}

export function ChatErrorBanner({ error, onDismiss }: ChatErrorBannerProps) {
  return (
    <ComposerBannerShell role="alert" className="flex items-center gap-2 text-destructive">
      <span className="flex-1 wrap-break-word">{error}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={onDismiss}
        className="text-destructive hover:text-destructive"
        aria-label="Dismiss error"
      >
        <IconX stroke={1.75} />
      </Button>
    </ComposerBannerShell>
  )
}
