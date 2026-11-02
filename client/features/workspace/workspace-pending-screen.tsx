import type { ReactNode } from 'react'

import { ScreenShell } from '@/client/components/shared/screen-shell'
import { WorkspacePane } from './workspace-frame'

type WorkspacePendingScreenProps = {
  setupRequired?: boolean
  children: ReactNode
}

export function WorkspacePendingScreen({
  setupRequired = false,
  children
}: WorkspacePendingScreenProps) {
  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col font-sans text-foreground">
      {setupRequired ? (
        <WorkspacePane mode="fullscreen">
          <ScreenShell aria-label="Workspace setup">{children}</ScreenShell>
        </WorkspacePane>
      ) : (
        children
      )}
    </div>
  )
}
