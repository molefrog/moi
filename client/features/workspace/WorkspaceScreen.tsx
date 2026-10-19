import type { ViewInfo, WidgetInfo } from '@/lib/types'

import { useWorkspaceLayoutCtx } from './WorkspaceLayoutContext'
import { WorkspaceContent } from './workspace-content'
import { WorkspaceSetupPanel } from './setup/workspace-setup-panel'
import { useWorkspaceSetup } from './setup/workspace-setup'

type WorkspaceScreenProps = {
  contentPending: boolean
  widgets: WidgetInfo[]
  views: ViewInfo[]
}

export function WorkspaceScreen({ contentPending, widgets, views }: WorkspaceScreenProps) {
  const { layout, workspaceId, name, provider } = useWorkspaceLayoutCtx()
  const { content, ready } = useWorkspaceSetup(workspaceId, contentPending, {
    name: name ?? 'Workspace',
    icon: layout.icon,
    workspaceType: provider,
    workspaceTheme: layout.theme
  })

  return ready ? (
    <WorkspaceContent widgets={widgets} views={views} />
  ) : (
    <WorkspaceSetupPanel>{content}</WorkspaceSetupPanel>
  )
}
