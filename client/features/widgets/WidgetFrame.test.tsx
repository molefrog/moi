import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { describe, expect, test } from 'bun:test'

import { DEFAULT_VIEWS_WIDGET } from '@/lib/default-widgets'
import { DEFAULT_PRIMARY_COLOR, deriveThemeColors } from '@/lib/themes'

import { WidgetFrame } from './WidgetFrame'

describe('WidgetFrame', () => {
  test('applies the swapped widget theme without forcing dark mode', () => {
    const html = renderToStaticMarkup(createElement(WidgetFrame))
    const chromeClasses = html.match(/data-widget-chrome="true"[^>]*class="([^"]+)"/)?.[1]
    const colors = deriveThemeColors(DEFAULT_PRIMARY_COLOR, 'widget')

    expect(chromeClasses).toBeDefined()
    expect(chromeClasses?.split(' ')).toContain('text-foreground')
    expect(chromeClasses).not.toContain('ring-')
    expect(chromeClasses).not.toContain('shadow-[')
    expect(chromeClasses?.split(' ')).not.toContain('dark')
    expect(html).toContain(`--background:${DEFAULT_PRIMARY_COLOR}`)
    expect(html).toContain(`--primary:${colors.primary}`)
    expect(html).toContain(`--ring:${colors.ring}`)
    expect(html).toContain(`--accent-foreground:${colors.accentForeground}`)
    expect(html).toContain(`--border:${colors.border}`)
  })

  test('uses the normal app surface for a default widget', () => {
    const html = renderToStaticMarkup(
      createElement(WidgetFrame, { widgetId: DEFAULT_VIEWS_WIDGET.id })
    )

    expect(html).not.toContain('data-vivid')
    expect(html).not.toContain(`--background:${DEFAULT_PRIMARY_COLOR}`)
  })
})
