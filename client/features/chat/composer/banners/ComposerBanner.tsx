import type { ComponentProps, ReactNode } from 'react'

import { cn } from '@/client/lib/cn'

export type ComposerBannerTone = 'muted' | 'destructive'

export type ComposerBanner = {
  tone: ComposerBannerTone
  content: ReactNode
}

type ComposerBannerCandidates = {
  agentUnavailable?: ComposerBanner
  chatError?: ComposerBanner
  skillUpdate?: ComposerBanner
}

export function resolveComposerBanner({
  agentUnavailable,
  chatError,
  skillUpdate
}: ComposerBannerCandidates): ComposerBanner | undefined {
  return agentUnavailable ?? chatError ?? skillUpdate
}

type ComposerBannerShellProps = ComponentProps<'div'>

export function ComposerBannerShell({ className, ...props }: ComposerBannerShellProps) {
  return <div {...props} className={cn('w-full p-2 text-sm @xl:p-1 @xl:pl-3', className)} />
}
