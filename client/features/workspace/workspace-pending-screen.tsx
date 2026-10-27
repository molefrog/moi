import type { ReactNode } from 'react'

import { WorkspaceSetupPanel } from './setup/workspace-setup-panel'
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
          <WorkspaceSetupPanel>{children}</WorkspaceSetupPanel>
        </WorkspacePane>
      ) : (
        children
      )}
    </div>
  )
}
