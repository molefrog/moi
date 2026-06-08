// Pre-build the client SPA into `dist/` for publishing.
//
// Why: a global install lives under `~/.bun/install/global/node_modules`, and
// Bun will not run bundler plugins (Tailwind, externalize-react) on source
// files in that tree — so the runtime Bun.serve bundler can't compile the app
// shell there. Building here, on a normal machine where plugins run, emits a
// plain compiled bundle (Tailwind already expanded) that production serves as
// static files. Dev still uses the live Bun.serve bundler (see server/web.ts).
import { rm } from 'node:fs/promises'
import { join } from 'node:path'

import externalizeReact from '../client/externalize-react.ts'
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
  minify: true,
  sourcemap: 'none',
  plugins: [tailwind, externalizeReact],
  define: { 'process.env.NODE_ENV': '"production"' }
})

if (!result.success) {
  console.error('Client build failed:')
  for (const log of result.logs) console.error('  ' + log.message)
  process.exit(1)
}

console.log(`Built client → dist/ (${result.outputs.length} files)`)
