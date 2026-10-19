import type { ReactNode } from 'react'

type WorkspaceSetupPanelProps = {
  children: ReactNode
}

export function WorkspaceSetupPanel({ children }: WorkspaceSetupPanelProps) {
  return (
    <section
      aria-label="Workspace setup"
      className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-muted texture-checker-20"
    >
      <div className="flex flex-1 flex-col bg-radial from-background from-25% to-transparent">
        {children}
      </div>
    </section>
  )
}
