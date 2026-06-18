import { existsSync } from 'node:fs'
import { join, sep } from 'node:path'

// Production (published/global install) ships a prebuilt client in `dist/`
// (see scripts/build-client.ts). When present we serve it as static files,
// because Bun's runtime bundler won't run plugins on source under the global
// install tree. In dev there is no `dist/`, so web.ts falls back to the
// imported HTML route + Bun.serve's live bundler (HMR). `import.meta.dir` is
// server/, so `dist/` sits one level up.
const DIST_DIR = join(import.meta.dir, '..', 'dist')
const DIST_INDEX = join(DIST_DIR, 'index.html')

// Serve prebuilt static assets when `dist/` exists — but never in dev mode
// (MOI_DEV is set by the dev supervisor), so `bun run dev` always uses the
// live bundler + HMR even if a stale `dist/` is lying around the working tree.
export const serveStatic = !process.env.MOI_DEV && existsSync(DIST_INDEX)

// The prebuilt SPA shell, served for client-side routes in production. In dev,
// web.ts uses the live-bundled HTML import instead (for HMR).
export function distShell(): Response {
  return new Response(Bun.file(DIST_INDEX))
}

// Serve a hashed asset (`/chunk-….js`, `/favicon-….png`, …) from `dist/`.
// Returns null when the path isn't a real file under dist (path-traversal safe).
export async function serveDistAsset(pathname: string): Promise<Response | null> {
  if (!serveStatic) return null
  const filePath = join(DIST_DIR, pathname)
  if (filePath !== DIST_DIR && !filePath.startsWith(DIST_DIR + sep)) return null
  const file = Bun.file(filePath)
  return (await file.exists()) ? new Response(file) : null
}
