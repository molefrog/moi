import type { ReactNode } from 'react'
import { cn } from '@/client/lib/cn'
import type { LayoutMode } from '@/lib/types'

type WorkspacePaneProps = {
  mode: LayoutMode
  children: ReactNode
}

export function WorkspacePane({ mode, children }: WorkspacePaneProps) {
  return (
    <div
      data-slot="workspace-pane"
      className={cn(
        '@container/workspace relative flex h-full min-h-0 min-w-0 flex-1 flex-col-reverse overflow-hidden bg-background shadow-md transition-[border-radius,background-color] duration-100 ease-out motion-reduce:transition-none',
        mode === 'split' && 'rounded-xl'
      )}
    >
      {children}
    </div>
  )
}
