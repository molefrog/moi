import { useEffect } from 'react'

import { useQueryClient } from '@tanstack/react-query'

import { workspaceKeys } from '@/client/api/workspace-keys'
import { LedLogo } from '@/client/components/shared/LedLogo'
import { SidebarLayout } from '@/client/app/shell/SidebarLayout'
import { liveStore } from '@/client/features/chat/chat-store'
import { useWorkspaceSessions } from '@/client/features/chat/api'
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
import type { SessionInfo } from '@/lib/types'

type WorkspaceRouteProps = {
  id: string
}

export function WorkspaceRoute({ id }: WorkspaceRouteProps) {
  return (
    <Workspace id={id}>
      <WorkspaceLayoutProvider id={id}>
        <WorkspaceLoader id={id} />
      </WorkspaceLayoutProvider>
    </Workspace>
  )
}

function WorkspaceLoader({ id }: WorkspaceRouteProps) {
  const queryClient = useQueryClient()
  const { layout, setLayout, isLoading: layoutLoading } = useWorkspaceLayoutCtx()
  const widgets = useWorkspaceWidgets(id)
  const views = useWorkspaceViews(id)
  const builders = useViewBuilders(id)
  const sessions = useWorkspaceSessions(id)

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

  const fresh = layoutLoading || widgets.isLoading || views.isLoading || builders.isLoading

  return (
    <>
      <SeedActiveSession workspaceId={id} sessions={sessions.data} />
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

type SeedActiveSessionProps = {
  workspaceId: string
  sessions: SessionInfo[] | undefined
}

function SeedActiveSession({ workspaceId, sessions }: SeedActiveSessionProps) {
  useEffect(() => {
    if (!sessions) return
    const activeByWorkspace = liveStore.getState().activeByWorkspace
    const hasActiveSelection = Object.prototype.hasOwnProperty.call(activeByWorkspace, workspaceId)
    const activeSessionId = activeByWorkspace[workspaceId]
    const activeStillValid =
      activeSessionId === null || sessions.some(session => session.sessionId === activeSessionId)
    if (hasActiveSelection && activeStillValid) return
    liveStore.getState().setActive(workspaceId, sessions[0]?.sessionId ?? null)
  }, [workspaceId, sessions])
  return null
}
