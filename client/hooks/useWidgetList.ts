import { useCallback, useEffect, useState } from 'react'

import type { WidgetInfo } from '@/lib/types'

import { useMeiEvent } from './useMeiEvents'

export function useWidgetList(): WidgetInfo[] {
  const [widgets, setWidgets] = useState<WidgetInfo[]>([])

  const fetchList = useCallback(() => {
    fetch('/_mei/widgets')
      .then(r => r.json())
      .then(data => setWidgets(data.widgets))
      .catch(() => setWidgets([]))
  }, [])

  useEffect(() => {
    fetchList()
  }, [fetchList])

  // Re-fetch when widgets are added or removed
  useMeiEvent(event => {
    if (event.type === 'widget-layout:updated') {
      fetchList()
    }
  })

  return widgets
}
