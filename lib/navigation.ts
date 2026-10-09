import type { WorkspaceTabId } from './types'
import { isWorkspaceTabId } from './workspace-tabs'

export type ViewParams = Record<string, string>
export type WorkspaceAddress = { tab: WorkspaceTabId; search: string }
export type WorkspaceDestination = WorkspaceAddress | { sessionId: string; search: string }

export function parseMoiHref(href: unknown): WorkspaceDestination {
  if (typeof href !== 'string' || !href.startsWith('moi:/') || href.startsWith('moi://')) {
    throw new Error('Expected a workspace address such as moi:/views/events?eventId=123')
  }
  const path = href.slice(5).split(/[?#]/, 1)[0]
  if (href.includes('#') || /[\s\\]/.test(path)) throw new Error('Invalid workspace address')
  const tab = tabFromPath(path)
  const sessionId = chatSessionIdFromPath(path)
  if (!tab && !sessionId) {
    throw new Error(`Unsupported workspace destination: ${path}`)
  }
  const query = href.indexOf('?')
  const search = query < 0 ? '' : canonicalSearch(href.slice(query + 1))
  return sessionId ? { sessionId, search } : { tab: tab!, search }
}

export function chatSessionIdFromPath(path: string): string | null {
  if (!path.startsWith('chats/')) return null
  try {
    const id = decodeURIComponent(path.slice('chats/'.length))
    return id && id !== '.' && id !== '..' && !/[/\\\s\0]/.test(id) ? id : null
  } catch {
    return null
  }
}

export function destinationHref(address: WorkspaceDestination): string {
  return 'sessionId' in address
    ? `moi:/chats/${encodeURIComponent(address.sessionId)}${address.search}`
    : moiHref(address.tab, address.search)
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
  const match = /^view:(.+)$/.exec(path)
  return match ? tabFromPath(`views/${match[1]}`) : null
}

export function moiHref(tab: WorkspaceTabId, search = ''): string {
  return `moi:/${tab}${canonicalSearch(search)}`
}

// Deployment-specific addressing is confined to this host adapter. Callers
// may supply the router base; portable links never contain it.
export function workspacePath(workspaceId: string, base = ''): string {
  return `${base.replace(/\/$/, '')}/workspace/${encodeURIComponent(workspaceId)}`
}

export function addressPath(workspaceId: string, address: WorkspaceDestination, base = ''): string {
  return `${workspacePath(workspaceId, base)}/${destinationHref(address).slice(5)}`
}

export function workspaceTabPath(workspaceId: string, tab: WorkspaceTabId): string {
  return addressPath(workspaceId, { tab, search: '' })
}

type ResolveUrlContext = { apiBase: string; workspacePath?: string }

export function resolveUrl(url: string, context: ResolveUrlContext): string {
  if (url.startsWith('moi:/files/')) {
    const tail = url.slice('moi:/files/'.length)
    const suffixIndex = tail.search(/[?#]/)
    const pathname = suffixIndex < 0 ? tail : tail.slice(0, suffixIndex)
    const suffix = suffixIndex < 0 ? '' : tail.slice(suffixIndex)
    const segments = pathname.split('/').map(segment => {
      const decoded = decodeURIComponent(segment)
      if (!decoded || decoded === '.' || decoded === '..' || /[/\\\0]/.test(decoded)) {
        throw new Error('Invalid workspace file path')
      }
      return encodeURIComponent(decoded)
    })
    return `${context.apiBase}/files/${segments.join('/')}${suffix}`
  }
  if (url.startsWith('moi:')) {
    const address = parseMoiHref(url)
    return context.workspacePath
      ? `${context.workspacePath}/${destinationHref(address).slice(5)}`
      : ''
  }
  // Only explicit ordinary web addresses may leave the workspace through the
  // imperative API. Native anchors keep their existing protocol policy.
  const resolved = new URL(url)
  if (resolved.protocol !== 'https:' && resolved.protocol !== 'http:')
    throw new Error('Unsupported URL')
  return resolved.href
}

export type NavigationRequest = {
  type: 'navigation:request'
  requestId: string
  workspaceId: string
  href: string
}
