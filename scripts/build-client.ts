// Pre-build the client SPA into `dist/` for publishing.
//
// Why: a global install lives under `~/.bun/install/global/node_modules`, and
// Bun will not run bundler plugins (Tailwind, externalize-react) on source
// files in that tree — so the runtime Bun.serve bundler can't compile the app
// shell there. Building here, on a normal machine where plugins run, emits a
// plain compiled bundle (Tailwind already expanded) that production serves as
// static files. Dev still uses the live Bun.serve bundler (see server/web.ts).
import { readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import externalizeReact from '../client/externalize-react'
import tailwind from 'bun-plugin-tailwind'

const root = join(import.meta.dir, '..')
const outdir = join(root, 'dist')

await rm(outdir, { recursive: true, force: true })

const result = await Bun.build({
  entrypoints: [join(root, 'client', 'index.html')],
  outdir,
  // Absolute asset URLs (`/chunk-….js`) so they resolve the same under any
  // SPA route (`/`, `/workspace/:id`, …), not relative to the current path.
  publicPath: '/',
  splitting: true,
  minify: true,
  sourcemap: 'none',
  plugins: [tailwind, externalizeReact],
  define: {
    'process.env.NODE_ENV': '"production"',
    // Inline the public tldraw license key. `define` (not `env: 'PUBLIC_*'`)
    // because it always replaces the literal — `?? ''` guarantees an unset key
    // degrades to an empty string (→ undefined client-side) instead of leaving a
    // bare `process.env.…` that throws `process is not defined` in the browser.
    'process.env.PUBLIC_TLDRAW_LICENSE_KEY': JSON.stringify(
      process.env.PUBLIC_TLDRAW_LICENSE_KEY ?? ''
    )
  }
})

if (!result.success) {
  console.error('Client build failed:')
  for (const log of result.logs) console.error('  ' + log.message)
  process.exit(1)
}

// Preload the chunks a cold load needs before the app renders: the entry's own
// imports (the browser only learns of them once the entry has downloaded) and
// everything they statically pull in. Without the hints each level of the
// import graph costs a serial round trip. Chunks reached only through deeper
// dynamic imports (the scratchpad, …) are left for their own time. React is
// preloaded by static links in client/index.html, since its URLs are fixed.
const STATIC_IMPORT = /\bfrom\s*"(\/[\w.-]+\.js)"/g
const DYNAMIC_IMPORT = /\bimport\(\s*"(\/[\w.-]+\.js)"\s*\)/g
const ENTRY_SCRIPT = /<script\b[^>]*\btype="module"[^>]*\bsrc="(\/[\w.-]+\.js)"/

async function startupChunks(html: string): Promise<string[]> {
  const entry = html.match(ENTRY_SCRIPT)?.[1]
  if (!entry) return []
  const read = (url: string) => readFile(join(outdir, url), 'utf8')
  const entryCode = await read(entry)
  const imports = (code: string, pattern: RegExp) => [...code.matchAll(pattern)].map(m => m[1]!)
  const seen = new Set([entry])
  const found: string[] = []
  const queue = [...imports(entryCode, STATIC_IMPORT), ...imports(entryCode, DYNAMIC_IMPORT)]
  while (queue.length) {
    const url = queue.shift()!
    if (seen.has(url)) continue
    seen.add(url)
    found.push(url)
    queue.push(...imports(await read(url), STATIC_IMPORT))
  }
  return found
}

const indexPath = join(outdir, 'index.html')
const html = await readFile(indexPath, 'utf8')
const chunks = await startupChunks(html)
// `crossorigin` matches the attribute Bun puts on the entry script, so the
// preloaded response is the one the module loader reuses. After `</head>`'s
// predecessors, i.e. after the importmap — a module fetch that starts before
// the map is parsed disables the map.
const links = chunks.map(href => `<link rel="modulepreload" crossorigin href="${href}">`)
await writeFile(indexPath, html.replace('</head>', `${links.join('')}</head>`))

console.log(
  `Built client → dist/ (${result.outputs.length} files, ${chunks.length} startup chunks preloaded)`
)
