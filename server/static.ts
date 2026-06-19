import { existsSync } from 'node:fs'
import { join } from 'node:path'

// Production (published/global install) ships a prebuilt client in `dist/`
// (see scripts/build-client.ts). When present we serve it as static files,
// because Bun's runtime bundler won't run plugins on source under the global
// install tree. In dev there is no `dist/`, so web.ts falls back to the
// imported HTML route + Bun.serve's live bundler (HMR). `import.meta.dir` is
// server/, so `dist/` sits one level up. The Hono API serves files from here
// via `serveStatic` (see api.ts).
export const DIST_DIR = join(import.meta.dir, '..', 'dist')
const DIST_INDEX = join(DIST_DIR, 'index.html')

// Whether to serve the prebuilt client from `dist/`: true in production, but
// never in dev mode (MOI_DEV is set by the dev supervisor), so `bun run dev`
// always uses the live bundler + HMR even if a stale `dist/` is lying around.
export const prebuilt = !process.env.MOI_DEV && existsSync(DIST_INDEX)

// The prebuilt SPA shell, served for client-side routes in production. In dev,
// web.ts uses the live-bundled HTML import instead (for HMR).
export function distShell(): Response {
  return new Response(Bun.file(DIST_INDEX))
}
