import type { ReactNode } from 'react'

export function PanelHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="@container relative flex h-11 shrink-0 items-center gap-2.5 pr-3 pl-4 ring-1 ring-border">
      {children}
    </header>
  )
}
