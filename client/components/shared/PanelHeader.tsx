import type { ReactNode } from 'react'

export function PanelHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="@container flex h-11 shrink-0 items-center gap-2.5 border-b border-border/75 px-3">
      {children}
    </header>
  )
}
