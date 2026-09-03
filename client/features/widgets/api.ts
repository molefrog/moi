import { useMemo } from 'react'

import { useQuery } from '@tanstack/react-query'

import { requestJson } from '@/client/api/http'
import { WORKSPACE_RESOURCE_OPTIONS } from '@/client/api/query-options'
import { workspaceKeys } from '@/client/api/workspace-keys'
import { useWorkspaceLayoutCtx } from '@/client/features/workspace/WorkspaceLayoutContext'
import { useGridReconcile } from '@/client/features/widgets/useGridReconcile'
import { withDefaultWidgets } from '@/lib/default-widgets'
import type { WidgetInfo } from '@/lib/types'

export function useWidgets(workspaceId: string) {
  const { layout, setLayout } = useWorkspaceLayoutCtx()
  const query = useQuery<WidgetInfo[]>({
    queryKey: workspaceKeys.widgets(workspaceId),
    queryFn: async () => {
      const data = await requestJson<{ widgets: WidgetInfo[] }>(
        `/api/workspaces/${workspaceId}/widgets`
      )
      return data.widgets
    },
    ...WORKSPACE_RESOURCE_OPTIONS
  })
  const widgets = useMemo(() => withDefaultWidgets(query.data ?? []), [query.data])

  useGridReconcile(workspaceId, query.data ? widgets : undefined, layout, setLayout)

  return { ...query, data: widgets }
}
