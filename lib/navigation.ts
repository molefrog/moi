import type { WorkspaceTabId } from './types'

export type ViewParams = Record<string, string>
export type WorkspaceAddress = { tab: WorkspaceTabId; search: string }

// Public destinations deliberately exclude the current singleton chat and
// transient builders.
export function parseMoiHref(href: unknown): WorkspaceAddress {
  if (typeof href !== 'string' || !href.startsWith('moi:/') || href.startsWith('moi://')) {
    throw new Error('Expected a workspace address such as moi:/views/events?eventId=123')
  }
  const path = href.slice(5).split(/[?#]/, 1)[0]
  if (href.includes('#') || /[\s\\]/.test(path)) throw new Error('Invalid workspace address')
  const tab = tabFromPath(path)
  if (!tab || tab === 'agent' || tab.startsWith('view-builder:')) {
    throw new Error(`Unsupported workspace destination: ${path}`)
  }
  const query = href.indexOf('?')
  const search = query < 0 ? '' : canonicalSearch(href.slice(query + 1))
  return { tab, search }
}

export function canonicalSearch(search: string): string {
  // Sorting makes equivalent addresses a no-op instead of adding history entries.
  const params = new URLSearchParams(search)
  params.sort()
  const result = params.toString()
  return result ? `?${result}` : ''
}

export function readViewParams(search: string): ViewParams {
  const params = new URLSearchParams(search)
  return Object.fromEntries(Array.from(params.keys(), key => [key, params.get(key)!]))
}

export function tabPath(tab: WorkspaceTabId): string {
  if (tab.startsWith('view:')) return `views/${encodeURIComponent(tab.slice(5))}`
  if (tab.startsWith('view-builder:')) return `view-builders/${encodeURIComponent(tab.slice(13))}`
  return tab
}

export function tabFromPath(path: string): WorkspaceTabId | null {
  if (path === 'overview' || path === 'scratchpad' || path === 'agent') return path
  const match = /^(views|view-builders)\/([^/]+)$/.exec(path)
  if (!match) return null
  try {
    const id = decodeURIComponent(match[2])
    // eslint-disable-next-line no-control-regex -- URL path IDs must reject control characters.
    if (id === '.' || id === '..' || /[/\\\u0000-\u001f\u007f]/.test(id)) return null
    return match[1] === 'views' ? `view:${id}` : `view-builder:${id}`
  } catch {
    return null
  }
}

export function moiHref(tab: WorkspaceTabId, search = ''): string {
  return `moi:/${tabPath(tab)}${canonicalSearch(search)}`
}

// Deployment-specific addressing is confined to this host adapter. Callers
// may supply the router base; portable links never contain it.
export function workspacePath(workspaceId: string, base = ''): string {
  return `${base.replace(/\/$/, '')}/workspace/${encodeURIComponent(workspaceId)}`
}

export function addressPath(workspaceId: string, address: WorkspaceAddress, base = ''): string {
  return `${workspacePath(workspaceId, base)}/${tabPath(address.tab)}${address.search}`
}

export function resolveWorkspaceHref(workspaceId: string, href: string, base = ''): string {
  if (href.startsWith('moi:')) return addressPath(workspaceId, parseMoiHref(href), base)
  // Only explicit ordinary web addresses may leave the workspace through the
  // imperative API. Native anchors keep their existing protocol policy.
  const url = new URL(href)
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Unsupported URL')
  return url.href
}

export type NavigationRequest = {
  type: 'navigation:request'
  requestId: string
  workspaceId: string
  href: string
}
