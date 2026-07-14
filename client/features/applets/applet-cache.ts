// Shared load cache for agent-authored applets (widgets / views).
//
// An applet is loaded as an ESM module via dynamic `import()`. The browser
// memoizes a module by its exact URL forever, so to pick up a rebuilt bundle the
// URL must change — we vary a `?v=<n>` per applet. The catch: a workspace shows
// one view (or the widget grid) at a time, so most applets are UNMOUNTED at any
// moment. If invalidation lived only in the mounted component, an applet rebuilt
// while its tab is in the background would never bump its version and would be
// served stale from cache on the next mount.
//
// So the cache + version registry live here, module-level and mount-independent:
// a workspace-wide listener invalidates on every `*:updated` event (see
// `useAppletCacheInvalidation`), and the per-applet hook invalidates the mounted
// one too. Either path bumps the version + drops the cached module, so the next
// load() fetches the rebuilt bundle.
export type AppletSegment = 'widgets' | 'views'

// `${segment}/${workspaceId}/${name}` — namespaced so a widget and a view (or
// two workspaces) sharing a name never collide.
export function appletKey(segment: AppletSegment, workspaceId: string, name: string): string {
  return `${segment}/${workspaceId}/${name}`
}

const versions = new Map<string, number>()
const moduleCache = new Map<string, Promise<unknown>>()

export function appletVersion(segment: AppletSegment, workspaceId: string, name: string): number {
  return versions.get(appletKey(segment, workspaceId, name)) ?? 0
}

// The cache-busting import URL for an applet's entry at its current version.
// Assets + chunks resolve module-relative from the entry (via import.meta.url),
// so they don't inherit `?v` and aren't re-fetched needlessly.
export function appletUrl(segment: AppletSegment, workspaceId: string, name: string): string {
  return `/api/workspaces/${workspaceId}/${segment}/${name}/index.js?v=${appletVersion(segment, workspaceId, name)}`
}

export function getCachedApplet(key: string): Promise<unknown> | undefined {
  return moduleCache.get(key)
}

export function setCachedApplet(key: string, mod: Promise<unknown>): void {
  moduleCache.set(key, mod)
}

// Drop the cached module and bump the load version for one applet, so the next
// load() — including a fresh mount of a previously-backgrounded tab — fetches the
// rebuilt bundle instead of the memoized old one. Safe (and intended) to call
// when nothing for this applet is mounted.
export function invalidateApplet(segment: AppletSegment, workspaceId: string, name: string): void {
  const key = appletKey(segment, workspaceId, name)
  moduleCache.delete(key)
  versions.set(key, (versions.get(key) ?? 0) + 1)
}
