import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { describe, expect, test } from 'bun:test'

import { DEFAULT_PRIMARY_COLOR } from '@/lib/themes'

import { WidgetFrame } from './WidgetFrame'

describe('WidgetFrame', () => {
  test('applies the swapped widget theme without forcing dark mode', () => {
    const html = renderToStaticMarkup(createElement(WidgetFrame))
    const chromeClasses = html.match(/data-widget-chrome="true"[^>]*class="([^"]+)"/)?.[1]

    expect(chromeClasses).toBeDefined()
    expect(chromeClasses?.split(' ')).toContain('text-foreground')
    expect(chromeClasses?.split(' ')).not.toContain('dark')
    expect(html).toContain(`--background:${DEFAULT_PRIMARY_COLOR}`)
    expect(html).toContain('--primary:color-mix(in srgb, var(--background) 3%, oklch(1 0 0) 97%)')
    expect(html).toContain('--accent-foreground:var(--foreground)')
    expect(html).toContain('--border:color-mix(in srgb, var(--foreground) 15%, transparent)')
  })
})
