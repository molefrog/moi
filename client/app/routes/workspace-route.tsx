import { useWorkspaceTheme } from '@/client/runtime/workspace-theme'
import { CollabProvider, useCollabEnabled } from '@/client/features/collab'
import { useQueryClient } from '@tanstack/react-query'

import { workspaceKeys } from '@/client/api/workspace-keys'
import { useAppConfig } from '@/client/api/app-config'
import { SidebarLayout } from '@/client/app/shell/sidebar-layout'
import { useSelectedSession } from '@/client/features/chat/sessions/use-selected-session'
import { useAppletCacheInvalidation } from '@/client/features/applets/use-applet'
import { Workspace } from '@/client/features/workspace/workspace-context'
import {
  WorkspaceLayoutProvider,
  useWorkspaceLayoutCtx
} from '@/client/features/workspace/workspace-layout-context'
import { WorkspaceScreen } from '@/client/features/workspace/workspace-screen'
import { useViews } from '@/client/features/views/api'
import { useWidgets } from '@/client/features/overview/api'
import { useWorkspaceEvent } from '@/client/runtime/use-workspace-events'
import { BROWSER_TAB_ID } from '@/client/lib/browser-tab-id'

type WorkspaceRouteProps = {
  id: string
}

// Navigation reads the raw browser address so encoded paths and query params
// are decoded exactly once; the route only owns the workspace ID.
export function WorkspaceRoute({ id }: WorkspaceRouteProps) {
  const { experimental } = useAppConfig()

  return (
    <Workspace id={id}>
      <WorkspaceLayoutProvider id={id}>
        <CollabProvider workspaceId={id} enabled={experimental.collab}>
          <WorkspaceContent id={id} />
        </CollabProvider>
      </WorkspaceLayoutProvider>
    </Workspace>
  )
}

function WorkspaceContent({ id }: WorkspaceRouteProps) {
  const collabEnabled = useCollabEnabled()
  const queryClient = useQueryClient()
  const [selectedSessionId] = useSelectedSession()
  const { isLoading: layoutLoading, layout } = useWorkspaceLayoutCtx()
  useWorkspaceTheme(layout.theme)
  const widgets = useWidgets(id)
  const views = useViews(id)
  useAppletCacheInvalidation()

  useWorkspaceEvent(event => {
    if (event.type === 'theme:updated' || event.type === 'workspace:updated') {
      // Skip our own save: the cache already holds it, and the refetch could
      // land an older value over a newer optimistic change.
      if (event.origin === BROWSER_TAB_ID) return
      queryClient.invalidateQueries({ queryKey: workspaceKeys.layout(id) })
    } else if (event.type === 'widget-layout:updated' || event.type === 'widget:updated') {
      // widget:updated too: a rebundle bumps the widget's content revision, and
      // the thumbnail invalidation hook reads it off this query.
      queryClient.invalidateQueries({ queryKey: workspaceKeys.widgets(id) })
    } else if (event.type === 'view-layout:updated' || event.type === 'view:updated') {
      // view:updated also bumps the built bundle revision used by thumbnail
      // freshness checks.
      queryClient.invalidateQueries({ queryKey: workspaceKeys.views(id) })
    }
  })

  const contentPending =
    layoutLoading || selectedSessionId === undefined || widgets.isLoading || views.isLoading

  return (
    <SidebarLayout>
      {/* Reset the screen when switching between shared and browser tab state. */}
      <WorkspaceScreen
        key={collabEnabled ? 'browser-tab' : 'shared'}
        contentPending={contentPending}
        widgets={widgets.data}
        views={views.data ?? []}
      />
    </SidebarLayout>
  )
}
