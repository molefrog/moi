import { describe, expect, test } from 'bun:test'

import type { WidgetInfo } from './types'
import {
  createDefaultWidgetGrid,
  DEFAULT_VIEWS_WIDGET,
  isDefaultWidget,
  withDefaultWidgets
} from './default-widgets'

const clock: WidgetInfo = {
  id: 'clock',
  config: { colSpan: 2, rowSpan: 1 }
}

describe('default widgets', () => {
  test('registers defaults before applet widgets', () => {
    expect(withDefaultWidgets([clock])).toEqual([DEFAULT_VIEWS_WIDGET, clock])
    expect(isDefaultWidget(DEFAULT_VIEWS_WIDGET.id)).toBe(true)
    expect(isDefaultWidget(clock.id)).toBe(false)
  })

  test('creates their default grid entries', () => {
    expect(createDefaultWidgetGrid()).toEqual([{ i: DEFAULT_VIEWS_WIDGET.id, x: 0, y: 0 }])
  })
})
