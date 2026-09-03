import type { ReactNode } from 'react'

import type { ViewBuilder, ViewInfo } from '@/lib/types'
import { DEFAULT_VIEWS_WIDGET, isDefaultWidget, type DefaultWidgetId } from '@/lib/default-widgets'

import { ViewsWidget } from './ViewsWidget'

export type DefaultWidgetRenderContext = {
  views: ViewInfo[]
  builders: ViewBuilder[]
  onOpenView: (viewId: string) => void
  onCreateView: () => void
}

type DefaultWidgetRenderer = (context: DefaultWidgetRenderContext) => ReactNode

const DEFAULT_WIDGET_RENDERERS: Record<DefaultWidgetId, DefaultWidgetRenderer> = {
  [DEFAULT_VIEWS_WIDGET.id]: context => (
    <ViewsWidget
      views={context.views}
      builders={context.builders}
      onOpenView={context.onOpenView}
      onCreateView={context.onCreateView}
    />
  )
}

export function renderDefaultWidget(
  id: string,
  context: DefaultWidgetRenderContext
): ReactNode | undefined {
  if (!isDefaultWidget(id)) return undefined
  return DEFAULT_WIDGET_RENDERERS[id](context)
}
