import type { ReactNode } from 'react'

import type { ViewInfo } from '@/lib/types'
import { DEFAULT_VIEWS_WIDGET, isDefaultWidget, type DefaultWidgetId } from '@/lib/default-widgets'

import { ViewsWidget } from './views-widget'

export type DefaultWidgetRenderContext = {
  views: ViewInfo[]
  onOpenView: (viewId: string) => void
  onCreateView: () => void
  showOnboarding: boolean
}

type DefaultWidgetRenderer = (context: DefaultWidgetRenderContext) => ReactNode

const DEFAULT_WIDGET_RENDERERS: Record<DefaultWidgetId, DefaultWidgetRenderer> = {
  [DEFAULT_VIEWS_WIDGET.id]: context => (
    <ViewsWidget
      views={context.views}
      onOpenView={context.onOpenView}
      onCreateView={context.onCreateView}
      showOnboarding={context.showOnboarding}
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
