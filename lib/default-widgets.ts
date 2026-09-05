import type { LayoutGridItem, WidgetInfo } from './types'

export type DefaultWidgetDefinition = WidgetInfo & {
  defaultPosition: Omit<LayoutGridItem, 'i'>
}

export const DEFAULT_VIEWS_WIDGET = {
  id: '_moi_views',
  config: { colSpan: 4, rowSpan: 1 },
  defaultPosition: { x: 0, y: 0 }
} as const satisfies DefaultWidgetDefinition

export const DEFAULT_WIDGETS = [
  DEFAULT_VIEWS_WIDGET
] as const satisfies readonly DefaultWidgetDefinition[]

export type DefaultWidgetId = (typeof DEFAULT_WIDGETS)[number]['id']

const DEFAULT_WIDGET_IDS = new Set<string>(DEFAULT_WIDGETS.map(widget => widget.id))

export function isDefaultWidget(id: string): id is DefaultWidgetId {
  return DEFAULT_WIDGET_IDS.has(id)
}

// Registry order seeds defaults and the hidden panel; saved positions control visible order.
export function withDefaultWidgets(widgets: readonly WidgetInfo[]): WidgetInfo[] {
  return [...DEFAULT_WIDGETS, ...widgets]
}

export function createDefaultWidgetGrid(): LayoutGridItem[] {
  return DEFAULT_WIDGETS.map(widget => ({ i: widget.id, ...widget.defaultPosition }))
}
