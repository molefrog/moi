import { cn } from '@/client/lib/cn'
import type { ReactNode } from 'react'

export function PanelHeader({ children }: { children?: ReactNode }) {
  return (
    <header
      className={cn(
        '@container relative flex shrink-0 items-center gap-2 py-2 pr-3 pl-4',
        // Header bottom border that overflows the tab content and contrasts with it
        'after:absolute after:top-full after:left-0 after:h-px after:w-full after:bg-border'
      )}
    >
      {children}
    </header>
  )
}
