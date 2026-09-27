import type { WorkspaceTabId } from './types'
import { isWorkspaceTabId } from './workspace-tabs'

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
  if (!tab || tab === 'agent' || tab.startsWith('view-builders/')) {
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

export function tabFromPath(path: string): WorkspaceTabId | null {
  try {
    const tab = decodeURIComponent(path)
    return isWorkspaceTabId(tab) ? tab : null
  } catch {
    return null
  }
}

// Compatibility for old browser bookmarks only; saved tab state uses paths.
export function legacyTabFromPath(path: string): WorkspaceTabId | null {
  const match = /^(view|view-builder):(.+)$/.exec(path)
  return match ? tabFromPath(`${match[1]}s/${match[2]}`) : null
}

export function moiHref(tab: WorkspaceTabId, search = ''): string {
  return `moi:/${tab}${canonicalSearch(search)}`
}

// Deployment-specific addressing is confined to this host adapter. Callers
// may supply the router base; portable links never contain it.
export function workspacePath(workspaceId: string, base = ''): string {
  return `${base.replace(/\/$/, '')}/workspace/${encodeURIComponent(workspaceId)}`
}

export function addressPath(workspaceId: string, address: WorkspaceAddress, base = ''): string {
  return `${workspacePath(workspaceId, base)}/${address.tab}${address.search}`
}

export function workspaceTabPath(workspaceId: string, tab: WorkspaceTabId): string {
  return addressPath(workspaceId, { tab, search: '' })
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
