import { isWorkspaceTabId } from './workspace-tabs'

type ResolveUrlContext = {
  workspaceId?: string
  base?: string
  // Applet bundles know their file endpoint before the host attaches a bridge.
  apiBase?: string
}

// Without a workspace, validates and normalizes a portable address (used by the CLI).
export function resolveUrl(
  url: unknown,
  { workspaceId, base = '', apiBase }: ResolveUrlContext = {}
): string {
  if (typeof url !== 'string') throw new Error('A URL is required')
  if (!url.startsWith('moi:')) {
    const resolved = new URL(url)
    if (resolved.protocol !== 'https:' && resolved.protocol !== 'http:')
      throw new Error('Unsupported URL')
    return resolved.href
  }
  if (!url.startsWith('moi:/') || url.startsWith('moi://'))
    throw new Error('Expected a workspace address such as moi:/views/events?eventId=123')

  const tail = url.slice(5)
  const suffixIndex = tail.search(/[?#]/)
  const pathname = suffixIndex < 0 ? tail : tail.slice(0, suffixIndex)
  const suffix = suffixIndex < 0 ? '' : tail.slice(suffixIndex)
  const segments = pathname.split('/').map(decodeURIComponent)
  if (
    segments.some(
      segment => !segment || segment === '.' || segment === '..' || /[/\\\0]/.test(segment)
    )
  )
    throw new Error('Invalid workspace address')

  const id = workspaceId === undefined ? undefined : encodeURIComponent(workspaceId)
  if (segments[0] === 'files') {
    if (segments.length < 2) throw new Error('Invalid workspace file path')
    const prefix = apiBase ?? (id === undefined ? 'moi:' : `/api/workspaces/${id}`)
    return `${prefix}/files/${segments.slice(1).map(encodeURIComponent).join('/')}${suffix}`
  }

  const path = segments.join('/')
  if (url.includes('#') || /\s/.test(path)) throw new Error('Invalid workspace address')
  if (
    path !== 'chat' &&
    !isWorkspaceTabId(path) &&
    !(segments[0] === 'chats' && segments.length === 2)
  )
    throw new Error(`Unsupported workspace destination: ${path}`)

  const params = new URLSearchParams(suffix)
  params.sort()
  const search = params.toString()
  const prefix = id === undefined ? 'moi:' : `${base.replace(/\/$/, '')}/workspace/${id}`
  return `${prefix}/${segments.map(encodeURIComponent).join('/')}${search ? `?${search}` : ''}`
}

export type NavigationRequest = {
  type: 'navigation:request'
  requestId: string
  workspaceId: string
  href: string
}
