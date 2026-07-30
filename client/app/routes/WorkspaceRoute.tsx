import { useQueryClient } from '@tanstack/react-query'

import { workspaceKeys } from '@/client/api/workspace-keys'
import { LedLogo } from '@/client/components/shared/LedLogo'
import { SidebarLayout } from '@/client/app/shell/SidebarLayout'
import {
  SelectedSessionProvider,
  useSelectedSession
} from '@/client/features/chat/SelectedSessionContext'
import { useAppletCacheInvalidation } from '@/client/features/applets/useApplet'
import { Workspace } from '@/client/features/workspace/WorkspaceContext'
import {
  WorkspaceLayoutProvider,
  useWorkspaceLayoutCtx
} from '@/client/features/workspace/WorkspaceLayoutContext'
import { WorkspaceScreen } from '@/client/features/workspace/WorkspaceScreen'
import { useWorkspaceViews, useWorkspaceWidgets } from '@/client/features/workspace/api'
import { useViewBuilders } from '@/client/features/views/api'
import { useGridReconcile } from '@/client/features/widgets/useGridReconcile'
import { useWorkspaceEvent } from '@/client/runtime/useWorkspaceEvents'

type WorkspaceRouteProps = {
  id: string
}

// The URL's tab segment is not threaded down — useWorkspaceNavigation reads it
// off the matched route with wouter's `useParams`.
export function WorkspaceRoute({ id }: WorkspaceRouteProps) {
  return (
    <Workspace id={id}>
      <WorkspaceLayoutProvider id={id}>
        <SelectedSessionProvider workspaceId={id}>
          <WorkspaceLoader id={id} />
        </SelectedSessionProvider>
      </WorkspaceLayoutProvider>
    </Workspace>
  )
}

function WorkspaceLoader({ id }: WorkspaceRouteProps) {
  const queryClient = useQueryClient()
  const { isLoading: selectedSessionLoading } = useSelectedSession()
  const { layout, setLayout, isLoading: layoutLoading } = useWorkspaceLayoutCtx()
  const widgets = useWorkspaceWidgets(id)
  const views = useWorkspaceViews(id)
  const builders = useViewBuilders(id)
  useGridReconcile(id, widgets.data, layout, setLayout)
  useAppletCacheInvalidation()

  useWorkspaceEvent(event => {
    if (event.type === 'theme:updated' || event.type === 'workspace:updated') {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.layout(id) })
    } else if (event.type === 'widget-layout:updated' || event.type === 'widget:updated') {
      // widget:updated too: a rebundle bumps the widget's content `tag`, and
      // the thumbnail invalidation hook reads it off this query.
      queryClient.invalidateQueries({ queryKey: workspaceKeys.widgets(id) })
    } else if (event.type === 'view-layout:updated') {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.views(id) })
    }
  })

  const fresh =
    layoutLoading ||
    selectedSessionLoading ||
    widgets.isLoading ||
    views.isLoading ||
    builders.isLoading

  return (
    <>
      <SidebarLayout>
        {fresh ? (
          <div className="flex h-full items-center justify-center">
            <LedLogo sprite="moi" effect="chaos" />
          </div>
        ) : (
          <WorkspaceScreen
            widgets={widgets.data ?? []}
            views={views.data ?? []}
            builders={builders.data ?? []}
          />
        )}
      </SidebarLayout>
    </>
  )
}
