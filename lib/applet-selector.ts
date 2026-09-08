export type AppletSegment = 'widgets' | 'views'
export type AppletSelector = AppletSegment | `${AppletSegment}/${string}`

export type ParsedAppletSelector = {
  segment: AppletSegment
  id?: string
}

const APPLET_SELECTOR_RE = /^(widgets|views)(?:\/([a-z0-9][a-z0-9_-]*))?$/

export function parseAppletSelector(value: string): ParsedAppletSelector | null {
  const match = value.match(APPLET_SELECTOR_RE)
  if (!match) return null
  return { segment: match[1] as AppletSegment, ...(match[2] ? { id: match[2] } : {}) }
}

export function appletSelectorMatches(
  selector: AppletSelector,
  segment: AppletSegment,
  id: string
): boolean {
  const [selectedSegment, selectedId] = selector.split('/')
  return selectedSegment === segment && (!selectedId || selectedId === id)
}
