import { useCallback, useEffect, useState } from 'react'

import { useWorkspaceId } from '@/client/lib/WorkspaceContext'
import type { WidgetInfo } from '@/lib/types'

import { useMeiEvent } from './useMeiEvents'

export function useWidgetList(): WidgetInfo[] {
  const workspaceId = useWorkspaceId()
  const [widgets, setWidgets] = useState<WidgetInfo[]>([])

  const fetchList = useCallback(() => {
    fetch(`/_mei/${workspaceId}/widgets`)
      .then(r => r.json())
      .then(data => setWidgets(data.widgets))
      .catch(() => setWidgets([]))
  }, [workspaceId])

  useEffect(() => {
    fetchList()
  }, [fetchList])

  useMeiEvent(event => {
    if (event.type === 'widget-layout:updated') {
      fetchList()
    }
  })

  return widgets
}
