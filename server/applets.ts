// Shared machinery for the kinds of **applet** — agent-authored UI units
// embedded in a workspace: grid **widgets** (`.moi/widgets/`) and full-screen
// **views** (`.moi/views/`). Both compile through `buildApplet` and are served
// as ESM. This module holds the kind-agnostic mechanics (paths, scan,
// staleness, prune, serve, build loop); the per-kind manifest shape, config
// schema, and MEI events live in `widgets.ts` / `views.ts`.
//
// Each applet builds into its OWN directory `.build/<kind>/<name>/`, holding a
// fixed `index.js` entry plus any code chunks and bundled assets (hashed
// images/fonts). The client dynamic-imports that entry at `<name>/module` — an
// extensionless alias, see `ENTRY_ROUTE_FILE` — and assets and chunks resolve
// module-relative from there. `.js` files carry the
// `%%MOI_APPLET_API_BASE%%` sentinel (for RPC + `fileUrl`), swapped to the real
// `/api/workspaces/<id>` base when served — so the on-disk bundle is
// workspace-agnostic.
import { realpathSync, statSync } from 'node:fs'
import { mkdir, readdir, rm } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'path'

import {
  APPLET_API_BASE_SENTINEL,
  type AppletKind,
  buildApplet,
  scanRelativeImports
} from './bundler/build-applet'

export type AppletPaths = {
  moiRoot: string
  sourceDir: string
  buildDir: string
  manifestPath: string
}

export function getAppletPaths(workspacePath: string, kind: AppletKind): AppletPaths {
  const moiRoot = join(workspacePath, '.moi')
  const dir = kind === 'widget' ? 'widgets' : 'views'
  const sourceDir = join(moiRoot, dir)
  const buildDir = join(moiRoot, '.build', dir)
  const manifestPath = join(buildDir, 'manifest.json')
  return { moiRoot, sourceDir, buildDir, manifestPath }
}

export function getAppletRevision(
  workspacePath: string,
  kind: AppletKind,
  id: string
): string | undefined {
  try {
    const { buildDir } = getAppletPaths(workspacePath, kind)
    const stat = statSync(join(buildDir, id, 'index.js'))
    return `${stat.size}-${Math.trunc(stat.mtimeMs)}`
  } catch {
    return undefined
  }
}

// Source module names in a kind's directory: `*.tsx`/`*.ts` minus `.server.ts`
// and minus `_`-prefixed files (`_utils.tsx`) — those are shared modules for
// entries to import, never entry points themselves.
export async function scanSources(sourceDir: string): Promise<string[]> {
  try {
    const entries = await readdir(sourceDir)
    return entries
      .filter(f => /\.(tsx|ts)$/.test(f) && !f.startsWith('_') && !f.endsWith('.server.ts'))
      .map(f => f.replace(/\.tsx?$/, ''))
  } catch {
    return []
  }
}

async function resolveSource(sourceDir: string, name: string): Promise<string | null> {
  for (const ext of ['.tsx', '.ts']) {
    const path = join(sourceDir, `${name}${ext}`)
    if (await Bun.file(path).exists()) return path
  }
  return null
}

// Backstop for pathological graphs: an applet wiring more distinct files than
// this is reported stale without walking further — stale-but-rebuilt is the
// safe degradation, and the cap keeps the per-bundle check bounded no matter
// what the imports look like. Counts every input, images and JSON included, so
// it sits well above what an asset-heavy applet reaches (the walk never enters
// node_modules); hitting it means something is off anyway.
const MAX_GRAPH_FILES = 256

// Files the walk keeps descending through — anything Bun treats as a module
// (`.ts`, `.mjs`, `.cts`, …). Everything else (`.json`, `.css`, images) is a
// leaf.
const MODULE_FILE_RE = /\.[mc]?[jt]sx?$/
// Which transpiler loader lexes a module's imports. Only `.ts`/`.mts`/`.cts`
// take the `ts` loader: angle-bracket casts (`<string>x`) parse there and are
// JSX everywhere else. `.js`/`.mjs`/`.cjs` go through `tsx`, which accepts both
// plain JS and the JSX some of them contain.
const TS_ONLY_FILE_RE = /\.[mc]?ts$/

// A bundle is stale if its entry `index.js` is missing, any file in its local
// import graph has an mtime >= the built entry's, or one of those imports no
// longer resolves to a file at all.
//
// The graph is one uniform walk over every RELATIVE import the entry reaches:
// shared `_utils.tsx`, `../lib/*.ts`, `./data.json`, `./logo.png`,
// `./db.server`. Each is resolved to a real path, mtime-checked, and descended
// into when it's a module — so an imported image and a transitively imported
// helper are the same case, not two mechanisms. Bare specifiers (node_modules)
// are not walked: after a dependency bump, `moi bundle --force`. The bundle
// itself is React-mode-agnostic (see buildApplet), so it needs no rebuild when
// the server switches between the development and production React.
//
// `.server.ts` modules are walked like anything else, which is deliberately
// MORE than the bundle needs: their code never ships to the client (only the
// export list, inlined as RPC stubs), so editing one — or anything it imports
// — cannot change a byte of `index.js`. We report stale anyway because 'built'
// is what drives the worker recycle downstream (see `reloadModules`, called
// from widgets.ts/views.ts for every rebuilt applet). Without it, editing a
// helper that only a server module imports would leave a live worker serving
// the old code with nothing to dislodge it. The redundant rebuild is the price
// of that signal; the alternative is a second staleness channel threaded
// through the build results.
async function needsRebuild(buildDir: string, name: string, srcPath: string): Promise<boolean> {
  const built = Bun.file(join(buildDir, name, 'index.js'))
  if (!(await built.exists())) return true
  const builtMtime = built.lastModified

  const queue = [srcPath]
  const visited = new Set<string>()
  while (queue.length > 0) {
    const path = queue.pop()!
    if (visited.has(path)) continue
    visited.add(path)
    if (visited.size > MAX_GRAPH_FILES) return true
    const file = Bun.file(path)
    if (!(await file.exists())) continue
    if (file.lastModified >= builtMtime) return true
    // Leaves stop at the mtime check above — an asset, JSON, or CSS file can't
    // import anything.
    if (!MODULE_FILE_RE.test(path)) continue
    const source = await file.text()
    const dir = dirname(path)
    for (const specifier of scanRelativeImports(
      source,
      TS_ONLY_FILE_RE.test(path) ? 'ts' : 'tsx'
    )) {
      const resolved = await resolveModuleImport(dir, specifier)
      // Nothing on disk answers this import, so the next build will fail on it.
      // Report stale rather than skip: a helper deleted since the last build
      // would otherwise leave `moi bundle` serving the last good bundle and
      // never surfacing the missing-import error.
      if (!resolved) return true
      queue.push(resolved)
    }
  }
  return false
}

// Extensions Bun appends to an extensionless import, in its own preference
// order (`./data` finds `data.tsx` before `data.ts` before … `data.json`).
// Doubles as the directory-index set: `./helpers` → `helpers/index.jsx`.
const RESOLVE_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js', '.mjs', '.cjs', '.json', '.mts', '.cts']

// TypeScript's output-extension rewrite: an import written against the emitted
// file name resolves to the source that produces it. (`.cjs` → `.cts` is
// deliberately absent — Bun doesn't do that one.)
const TS_EXTENSION_REWRITES: Record<string, string[]> = {
  '.js': ['.ts', '.tsx'],
  '.jsx': ['.tsx'],
  '.mjs': ['.mts']
}

// Resolve a relative import to the file the bundler will actually read. This
// mirrors Bun's resolution rather than delegating to `Bun.resolveSync`, which
// memoizes results for the life of the process: in the long-running server it
// keeps handing back the path of a dependency that has since been deleted or
// renamed, which is exactly the case this check has to catch. Every candidate
// is probed against the filesystem, in Bun's order — literal path, TS
// extension rewrite, appended extension, then directory (`package.json` main,
// else `index.*`). Returns null when nothing on disk answers the specifier.
async function resolveModuleImport(dir: string, specifier: string): Promise<string | null> {
  const base = join(dir, specifier)
  const candidates = [base]

  // Extension of the final segment only — a dot in a directory name (`./v1.2/x`)
  // is not one.
  const ext = /\.[^./\\]+$/.exec(base)?.[0] ?? ''
  for (const rewrite of TS_EXTENSION_REWRITES[ext] ?? []) {
    candidates.push(base.slice(0, base.length - ext.length) + rewrite)
  }
  for (const e of RESOLVE_EXTENSIONS) candidates.push(base + e)

  for (const candidate of candidates) {
    if (await Bun.file(candidate).exists()) return candidate
  }

  // Directory import. `package.json` main wins over `index.*`, matching Bun;
  // an unreadable or `main`-less manifest just falls through to the indexes.
  const pkg: unknown = await Bun.file(join(base, 'package.json'))
    .json()
    .catch(() => null)
  const main =
    typeof pkg === 'object' && pkg !== null && 'main' in pkg && typeof pkg.main === 'string'
      ? pkg.main
      : null
  if (main) {
    const mainPath = join(base, main)
    if (await Bun.file(mainPath).exists()) return mainPath
  }
  for (const e of RESOLVE_EXTENSIONS) {
    const index = join(base, `index${e}`)
    if (await Bun.file(index).exists()) return index
  }
  return null
}

// Built applet names: subdirectories of `buildDir` that hold an `index.js`
// entry. (`manifest.json` and any stray files are ignored.)
export async function listBuilt(buildDir: string): Promise<string[]> {
  try {
    const entries = await readdir(buildDir, { withFileTypes: true })
    const names: string[] = []
    for (const e of entries) {
      if (!e.isDirectory()) continue
      if (await Bun.file(join(buildDir, e.name, 'index.js')).exists()) names.push(e.name)
    }
    return names
  } catch {
    return []
  }
}

async function pruneStaleBuilds(buildDir: string, sourceNames: Set<string>): Promise<void> {
  let entries
  try {
    entries = await readdir(buildDir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    // Drop build dirs whose source is gone…
    if (e.isDirectory()) {
      if (!sourceNames.has(e.name)) {
        await rm(join(buildDir, e.name), { recursive: true, force: true }).catch(() => {})
      }
      continue
    }
    // …and sweep leftover flat `<name>.js` from the pre-directory layout (the
    // new layout never writes `.js` directly under buildDir — entries live in
    // `<name>/index.js`). manifest.json and other files are left alone.
    if (e.isFile() && e.name.endsWith('.js')) {
      await rm(join(buildDir, e.name), { force: true }).catch(() => {})
    }
  }
}

// Files an applet may serve from its build dir, by extension. JS is swapped +
// served as code; everything else streams raw (Bun infers content-type and
// supports range requests).
const CODE_FILE_RE = /\.js$/
// A single flat filename in the bundle dir: index.js, chunk-<hash>.js, or a
// hashed asset. First char may be `_`/`-` (asset stems derive from the source
// basename, e.g. `_icon.png` → `_icon-<hash>.png`) but never `.`, so no dotfile
// can be requested; `..` is rejected separately.
const ALLOWED_FILE_RE = /^[a-zA-Z0-9_-][a-zA-Z0-9._-]*$/

const JS_CONTENT_TYPE = 'text/javascript; charset=utf-8'
// A content-hashed url is a fingerprint of its bytes, so it's safe to cache
// without revalidation. But immutability here is INFERRED from the filename
// (HASHED_FILE_RE) rather than guaranteed by construction (unlike a sha256-named
// asset) — so we cap the TTL at a week instead of the usual year. If that
// inference ever misfires, a wrongly-pinned copy self-heals within a week at the
// edge and in the browser, rather than sticking around for a year.
const IMMUTABLE_CACHE = 'public, max-age=604800, immutable'

// Which build-dir files are safe to serve `immutable`. The build emits exactly
// two content-hashed shapes — Bun's `chunk-<hash>.js` and the runtime plugin's
// `<stem>-<hash>.<ext>` assets (hash = hex, see build-applet.ts) — alongside the
// ONE stable-named entry, `index.js`. We match those shapes POSITIVELY and
// default everything else (the entry, and anything unexpected) to revalidation:
// this fix exists to stop a shared cache pinning a stale copy at a stable url,
// so an unrecognized name must fail safe (revalidate), never fail stale
// (immutable). The hex-suffix arm rejects real words (`-sprite`, `-preview`) —
// they aren't hex — so only genuine hashes opt in.
const HASHED_FILE_RE = /^chunk-[0-9a-z]+\.\w+$|-[0-9a-f]{6,}\.\w+$/i

// Serve one file from a compiled applet directory: the `index.js` entry, a code
// chunk, or a bundled asset. `apiBase` is the workspace's `/api/workspaces/<id>`
// prefix — substituted for the build-time sentinel in every `.js` so RPC and
// `fileUrl` calls hit the right workspace. Assets stream untouched.
//
// `file` is the ON-DISK name (the route's extensionless entry alias is already
// mapped back to `index.js` by `parseAppletTail`), so the content-type and
// sentinel-swap decisions below key off the real `.js` — do not switch them to
// the requested url, or the entry would ship as `application/octet-stream` and
// fail the browser's module MIME check.
//
// Caching turns on the hashed-vs-stable split. A content-hashed chunk/asset gets
// a new url whenever its bytes change, so it's cached forever. The `index.js`
// entry (and anything not recognizably hashed) lives at ONE url across rebuilds,
// so a shared cache (e.g. Cloudflare) that stored it once would hand back a
// STALE copy after the next `moi bundle` — it gets an ETag (size+mtime) +
// `private, no-cache` instead, so an unchanged file costs a 304 and a rebuilt
// one busts. `private` keeps it out of any shared cache that would store it
// anyway, and is the one directive Cloudflare preserves when its Browser Cache
// TTL rewrites the header (see `ENTRY_ROUTE_FILE` for the rest of that story).
export async function serveApplet(
  kind: AppletKind,
  name: string,
  file: string,
  workspacePath: string,
  apiBase: string,
  ifNoneMatch?: string | null
): Promise<Response> {
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    return new Response('Invalid name', { status: 400 })
  }
  // Single path segment, no traversal — the bundle dir is flat.
  if (!ALLOWED_FILE_RE.test(file) || file.includes('..')) {
    return new Response('Invalid file', { status: 400 })
  }
  const { buildDir } = getAppletPaths(workspacePath, kind)
  const path = join(buildDir, name, file)
  const bunFile = Bun.file(path)
  if (!(await bunFile.exists())) {
    return new Response(`"${name}" not built. Run: moi bundle`, { status: 404 })
  }

  // Content-hashed → immutable. Everything else → revalidate (ETag + no-cache),
  // short-circuiting to a bodyless 304 when the client's ETag still matches.
  let cache: Record<string, string>
  if (HASHED_FILE_RE.test(file)) {
    cache = { 'Cache-Control': IMMUTABLE_CACHE }
  } else {
    const etag = `"${bunFile.size}-${Math.trunc(bunFile.lastModified)}"`
    cache = { ETag: etag, 'Cache-Control': 'private, no-cache' }
    if (ifNoneMatch === etag) return new Response(null, { status: 304, headers: cache })
  }

  if (CODE_FILE_RE.test(file)) {
    const swapped = (await bunFile.text()).replaceAll(APPLET_API_BASE_SENTINEL, apiBase)
    return new Response(swapped, { headers: { 'Content-Type': JS_CONTENT_TYPE, ...cache } })
  }
  return new Response(bunFile, {
    headers: { 'Content-Type': bunFile.type || 'application/octet-stream', ...cache }
  })
}

// ---- route helpers ----------------------------------------------------------
// Pure helpers behind the applet/fs/rpc HTTP routes, kept here (not web.ts) so
// they're unit-testable without importing web.ts — which binds ports on load.

// The API base a served bundle's sentinel is rewritten to. RPC + `fileUrl`
// hang off it, matching what the compiled `rpc()` / `fileUrl()` prepend.
export function apiBaseFor(id: string): string {
  return `/api/workspaces/${id}`
}

// The entry's real name in the bundle dir (`.build/<kind>/<name>/index.js`).
const ENTRY_DISK_FILE = 'index.js'

// …and the url the client asks for it at: `…/<segment>/<name>/module`. The route
// name and the disk name differ ON PURPOSE, and the reason is proxies.
//
// Cloudflare — which sits between many users and their moi, usually as a tunnel
// — decides whether a response is cache-eligible from the url's FILE EXTENSION,
// not from its content type, and `JS` is on its default cached-extension list.
// Once a response is cache-eligible, the zone's Browser Cache TTL applies, and
// that setting overrides the origin's `Cache-Control` on the way to the browser
// whenever the origin's freshness is lower than the TTL. Its default is 4 hours
// on every plan, so our `no-cache` came back to the browser as `max-age=14400`.
// The entry lives at ONE url across rebuilds, so that rewrite pinned a stale
// bundle in the user's browser for hours: no revalidation, so the ETag never got
// a chance to bust it, and `?v` couldn't either (it's an in-memory counter that
// resets to 0 on reload, landing right back on the poisoned url).
//
// An extensionless path isn't cache-eligible by default, so it reaches the
// browser with the headers we actually sent. Chunks and assets keep their
// extensions deliberately — they're content-hashed and WANT the edge cache.
// The build only ever emits `index.js`, `chunk-<hash>.js` and hashed assets, so
// this name can never collide with a real bundle file. Mirrors `appletUrl` in
// `client/features/applets/applet-cache.ts`.
const ENTRY_ROUTE_FILE = 'module'

// Split an applet file request `…/<segment>/<name>/<file>` into name + file. A
// bare `…/<segment>/<name>` (or legacy `…/<name>.js`) targets the entry, as does
// the extensionless `…/<name>/module` alias. `file` is always the on-disk name,
// so `serveApplet` never has to know the route spelling.
export function parseAppletTail(
  url: string,
  id: string,
  segment: 'widgets' | 'views'
): { name: string; file: string } {
  const tail = new URL(url).pathname.split(`/api/workspaces/${id}/${segment}/`)[1] ?? ''
  const slash = tail.indexOf('/')
  if (slash === -1) return { name: tail.replace(/\.js$/, ''), file: ENTRY_DISK_FILE }
  const file = tail.slice(slash + 1)
  return {
    name: tail.slice(0, slash),
    file: file === ENTRY_ROUTE_FILE ? ENTRY_DISK_FILE : file
  }
}

// Extensions `fileUrl()` may stream from the workspace. Media + image/doc
// assets only — deliberately excludes text/data (`.json`, `.env`, `.md`,
// source) so the route can't be used to exfiltrate arbitrary workspace data.
const FS_MEDIA_RE =
  /\.(mp4|webm|mov|m4v|mkv|mp3|wav|ogg|oga|m4a|flac|aac|opus|png|jpe?g|gif|webp|avif|svg|ico|pdf|vtt|srt)$/i

// Resolve a `/fs/`-style tail to a real on-disk path inside the workspace root,
// or an error Response. Hard guards (defense in depth): reject empty/`.`/`..`/
// dotfile segments and anything resolving outside the root, and require a media
// extension. The workspace holds secrets (`.env`, `.moi/`) and the routes built
// on this are unauthenticated — these guards are the protection, not the
// localhost bind. Shared by the raw stream (`serveWorkspaceFile`) and the image
// preview route (server/preview.ts).
export function resolveWorkspaceMediaFile(workspaceRoot: string, tail: string): string | Response {
  let rel: string
  try {
    rel = decodeURIComponent(tail)
  } catch {
    return new Response('Bad path', { status: 400 })
  }
  if (!rel || rel.includes('\0')) return new Response('Bad path', { status: 400 })

  const segments = rel.split('/')
  if (segments.some(s => s === '' || s === '.' || s === '..' || s.startsWith('.'))) {
    return new Response('Forbidden', { status: 403 })
  }
  if (!FS_MEDIA_RE.test(rel)) return new Response('Unsupported file type', { status: 415 })

  const root = resolve(workspaceRoot)
  const target = resolve(workspaceRoot, rel)
  if (target !== root && !target.startsWith(root + sep)) {
    return new Response('Forbidden', { status: 403 })
  }

  // The lexical check above is not enough: a symlink that lives inside the root
  // but points outside it would pass. Canonicalize both sides and re-check on
  // the real paths — this blocks symlink escape while still allowing symlinks
  // that stay within the workspace. realpathSync throws ENOENT for a missing
  // file, which doubles as the existence check (→ 404). Both sides are
  // canonicalized so a symlinked root (e.g. macOS /tmp → /private/tmp) isn't a
  // false escape.
  let realTarget: string
  try {
    realTarget = realpathSync(target)
  } catch {
    return new Response('Not found', { status: 404 })
  }
  let realRoot: string
  try {
    realRoot = realpathSync(root)
  } catch {
    return new Response('Forbidden', { status: 403 })
  }
  if (realTarget !== realRoot && !realTarget.startsWith(realRoot + sep)) {
    return new Response('Forbidden', { status: 403 })
  }
  return realTarget
}

// Stream a media file from the workspace root (guards: see
// `resolveWorkspaceMediaFile`).
//
// Range is handled explicitly (slice the BunFile, 206 + Content-Range): Bun's
// implicit range handling for `new Response(Bun.file())` doesn't fire once any
// headers object is attached, and <video>/<audio> seeking needs byte ranges.
//
// Caching: these are the user's own workspace files — private, and rewritten in
// place by the agent (a regenerated clip keeps its path). So they must NEVER be
// stored by a shared/edge cache sitting in front of moi, or one user's video
// could be served to the next, and an edited file could be served stale from a
// stable url (the applet-bundle incident, but with private bytes). `private`
// keeps them off the edge; a strong ETag (size + nanosecond mtime) + `no-cache`
// lets the browser revalidate cheaply (304) while re-fetching when it changes.
export async function serveWorkspaceFile(
  workspaceRoot: string,
  tail: string,
  range?: string | null,
  ifNoneMatch?: string | null
): Promise<Response> {
  const realTarget = resolveWorkspaceMediaFile(workspaceRoot, tail)
  if (realTarget instanceof Response) return realTarget
  const file = Bun.file(realTarget)

  let stat: ReturnType<typeof statSync>
  try {
    stat = statSync(realTarget, { bigint: true })
  } catch {
    return new Response('Not found', { status: 404 })
  }
  const size = Number(stat.size)
  const type = file.type || 'application/octet-stream'

  // Validator = size + NANOSECOND mtime. This route serves agent-regenerated
  // files at stable paths, so a weak validator that returns a false 304 pins
  // stale media in the browser. Truncating mtime to whole milliseconds (or
  // seconds) can collide when a same-length rewrite lands inside one tick; ns
  // resolution closes that window without hashing the (possibly huge) file on
  // every request. A tool that deliberately preserves mtime with same-size but
  // different bytes could still collide — only a content hash defeats that, and
  // it's not worth re-reading a video per request when agents rewrite normally.
  const etag = `"${size}-${stat.mtimeNs}"`
  const cache = { ETag: etag, 'Cache-Control': 'private, no-cache' }
  if (ifNoneMatch === etag) return new Response(null, { status: 304, headers: cache })

  const parsed = range ? parseByteRange(range, size) : null

  if (parsed === 'invalid') {
    return new Response('Range Not Satisfiable', {
      status: 416,
      headers: { ...cache, 'Content-Range': `bytes */${size}`, 'Accept-Ranges': 'bytes' }
    })
  }
  if (parsed) {
    const { start, end } = parsed
    return new Response(file.slice(start, end + 1), {
      status: 206,
      headers: {
        ...cache,
        'Content-Type': type,
        'Content-Length': String(end - start + 1),
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Accept-Ranges': 'bytes'
      }
    })
  }
  return new Response(file, {
    headers: {
      ...cache,
      'Content-Type': type,
      'Content-Length': String(size),
      'Accept-Ranges': 'bytes'
    }
  })
}

// Parse a single `bytes=start-end` (or suffix `bytes=-N`) range against a known
// size. Returns the inclusive [start, end], null when there's no usable range
// header, or 'invalid' for an unsatisfiable range (→ 416). Multi-range requests
// are not supported (we serve the whole file instead — null).
function parseByteRange(
  header: string,
  size: number
): { start: number; end: number } | null | 'invalid' {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!m) return null
  const hasStart = m[1] !== ''
  const hasEnd = m[2] !== ''
  if (!hasStart && !hasEnd) return null
  if (size === 0) return 'invalid'

  let start: number
  let end: number
  if (!hasStart) {
    // Suffix range: the last N bytes.
    const n = parseInt(m[2], 10)
    start = Math.max(0, size - n)
    end = size - 1
  } else {
    start = parseInt(m[1], 10)
    end = hasEnd ? Math.min(parseInt(m[2], 10), size - 1) : size - 1
  }
  if (start > end || start >= size || start < 0) return 'invalid'
  return { start, end }
}

export type AppletBuildResult<C> = {
  name: string
  status: 'built' | 'skipped' | 'failed'
  error?: string
  serverModules?: string[]
  config?: C | null
}

// Build every stale (or all, when `force`) source for one kind: prunes orphaned
// build dirs, writes fresh `<name>/` directories (entry + chunks + assets), and
// returns per-entry results with the parsed config and server-module names.
// Manifest persistence and MEI broadcasting are the caller's responsibility —
// they differ per kind.
export async function buildApplets<C>(
  workspacePath: string,
  kind: AppletKind,
  force: boolean
): Promise<{ names: string[]; results: AppletBuildResult<C>[]; ms: number }> {
  const t0 = performance.now()
  const { sourceDir, buildDir, moiRoot } = getAppletPaths(workspacePath, kind)
  const names = await scanSources(sourceDir)

  // Only scaffold the build dir once there's something to build — never
  // fabricate a `.build/` (and the phantom nested `.moi/.moi/` it implies) for a
  // directory with no sources. When sources have all been deleted we skip the
  // mkdir but still prune so orphaned build dirs are swept (pruneStaleBuilds
  // no-ops if buildDir doesn't exist).
  if (names.length > 0) {
    await mkdir(buildDir, { recursive: true })
  }
  await pruneStaleBuilds(buildDir, new Set(names))

  const jobs = await Promise.all(
    names.map(async name => {
      const srcPath = await resolveSource(sourceDir, name)
      if (!srcPath) return { name, status: 'failed' as const, error: 'Source file not found' }
      if (!force && !(await needsRebuild(buildDir, name, srcPath))) {
        return { name, status: 'skipped' as const }
      }
      return { name, srcPath, status: 'pending' as const }
    })
  )

  const results = await Promise.all(
    jobs.map(async (job): Promise<AppletBuildResult<C>> => {
      if (job.status === 'failed') return { name: job.name, status: 'failed', error: job.error }
      if (job.status === 'skipped') return { name: job.name, status: 'skipped' }
      try {
        const artifact = await buildApplet(job.srcPath!, moiRoot, kind)
        // Clear the dir first so stale hashed assets from a prior build don't
        // accumulate, then write the fresh entry + chunks + assets.
        const dir = join(buildDir, job.name)
        await rm(dir, { recursive: true, force: true })
        await mkdir(dir, { recursive: true })
        for (const f of artifact.files) {
          await Bun.write(join(dir, f.name), f.data)
        }
        return {
          name: job.name,
          status: 'built',
          serverModules: artifact.serverModules.map(m => m.name),
          config: (artifact.config as C | null) ?? null
        }
      } catch (err) {
        return {
          name: job.name,
          status: 'failed',
          error: err instanceof Error ? err.message : 'Unknown error'
        }
      }
    })
  )

  return { names, results, ms: Math.round(performance.now() - t0) }
}
