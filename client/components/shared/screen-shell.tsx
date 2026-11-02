import type { ComponentProps } from 'react'

import { cn } from '@/client/lib/cn'

type ScreenShellProps = ComponentProps<'section'>

// Shared backdrop for standalone flows and setup panes. The caller controls
// the available height, content width, spacing, and alignment.
export function ScreenShell({ children, className, ...props }: ScreenShellProps) {
  return (
    <section
      {...props}
      className={cn(
        'flex min-h-0 flex-1 flex-col overflow-y-auto bg-muted texture-checker-20',
        className
      )}
    >
      <div className="flex flex-1 flex-col bg-radial from-background from-25% to-transparent">
        {children}
      </div>
    </section>
  )
}
