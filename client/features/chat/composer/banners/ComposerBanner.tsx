import type { ComponentProps, ReactNode } from 'react'

import { cn } from '@/client/lib/cn'

export type ComposerBannerTone = 'default' | 'error'

export type ComposerBanner = {
  tone: ComposerBannerTone
  content: ReactNode
}

type ComposerBannerShellProps = ComponentProps<'div'>

export function ComposerBannerShell({ className, ...props }: ComposerBannerShellProps) {
  return <div {...props} className={cn('w-full p-2 text-sm @xl:p-1 @xl:pl-3', className)} />
}
