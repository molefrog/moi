import type { ReactNode } from 'react'

import { Button } from '@/client/components/ui/button'
import {
  WorkspaceSettingsDialog,
  WorkspaceSettingsDialogTrigger
} from '@/client/features/settings/WorkspaceSettingsDialog'

type WorkspaceSetupPanelProps = {
  children: ReactNode
  showSettings?: boolean
}

export function WorkspaceSetupPanel({ children, showSettings }: WorkspaceSetupPanelProps) {
  return (
    <section aria-label="Workspace setup" className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      {children}
      {showSettings && (
        <div className="flex justify-center p-4">
          <WorkspaceSettingsDialog>
            <WorkspaceSettingsDialogTrigger render={<Button variant="ghost" />}>
              Workspace settings
            </WorkspaceSettingsDialogTrigger>
          </WorkspaceSettingsDialog>
        </div>
      )}
    </section>
  )
}
