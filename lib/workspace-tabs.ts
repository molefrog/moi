// Workspace tab addressing, shared by the client router, the control server,
// and the CLI. A tab id doubles as the URL suffix of `/workspace/:id/<tab>` —
// ids are URL-safe as-is (`:` is a legal path character), so building a path
// is plain concatenation and parsing is plain validation.
import type { WorkspaceTabId } from './types'

export function isWorkspaceTabId(value: unknown): value is WorkspaceTabId {
  return (
    value === 'agent' ||
    value === 'widgets' ||
    value === 'scratchpad' ||
    // One path segment: a URL wildcard can span segments, a tab id never does.
    (typeof value === 'string' &&
      (/^view:[^/]+$/.test(value) || /^view-builder:[^/]+$/.test(value)))
  )
}

// The tab id carried by a URL's wildcard segment, or null when the segment is
// missing or isn't a tab id (bare `/workspace/:id`, stale or mangled links).
export function parseWorkspaceTab(segment: string | null | undefined): WorkspaceTabId | null {
  return isWorkspaceTabId(segment) ? segment : null
}

export function workspaceTabPath(workspaceId: string, tab: WorkspaceTabId): string {
  return `/workspace/${workspaceId}/${tab}`
}

export const viewTabId = (viewId: string): WorkspaceTabId => `view:${viewId}`
export const viewIdFromTab = (tab: WorkspaceTabId): string | null =>
  tab.startsWith('view:') ? tab.slice('view:'.length) : null
export const viewBuilderTabId = (builderId: string): WorkspaceTabId => `view-builder:${builderId}`
export const viewBuilderIdFromTab = (tab: WorkspaceTabId): string | null =>
  tab.startsWith('view-builder:') ? tab.slice('view-builder:'.length) : null

// The only params shape focusTab / `moi tab focus` carry: one JSON-plain
// object. Arrays and null are valid JSON but not a params record.
export function isParamsRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// Applet params as read back from navigation state (`state.appletParams`).
// Anything malformed degrades to `{}` — a view must render with empty params
// anyway (fresh mount, new browser tab, plain tab-bar click).
export function readAppletParams(state: unknown): Record<string, unknown> {
  if (!isParamsRecord(state)) return {}
  const params = (state as { appletParams?: unknown }).appletParams
  return isParamsRecord(params) ? params : {}
}
