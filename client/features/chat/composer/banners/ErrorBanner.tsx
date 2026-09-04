import { IconX } from '@tabler/icons-react'

import { Button } from '@/client/components/ui/button'

import { ComposerBannerShell } from './ComposerBanner'

type ErrorBannerProps = {
  error: string
  onDismiss?: () => void
  onRetry?: () => void
}

export function ErrorBanner({ error, onDismiss, onRetry }: ErrorBannerProps) {
  return (
    <ComposerBannerShell role="alert" className="flex items-center gap-2 text-destructive">
      <span className="flex-1 wrap-break-word">{error}</span>
      {onRetry && (
        <Button type="button" variant="ghost" size="sm" onClick={onRetry}>
          Retry
        </Button>
      )}
      {onDismiss && (
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
      )}
    </ComposerBannerShell>
  )
}
