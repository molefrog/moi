// Shared machinery for the kinds of **applet** — agent-authored UI units
// embedded in a workspace: grid **widgets** (`.moi/widgets/`) and full-screen
// **views** (`.moi/views/`). Both compile through `buildApplet` and are served
// as ESM. This module holds the kind-agnostic mechanics (paths, scan,
// staleness, prune, serve, build loop); the per-kind manifest shape, config
// schema, and MEI events live in `widgets.ts` / `views.ts`.
import { mkdir, readdir, unlink } from 'node:fs/promises'
import { dirname, join } from 'path'

import { type AppletKind, buildApplet, scanServerImports } from './build-applet'

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

// Source module names in a kind's directory: `*.tsx`/`*.ts` minus `.server.ts`.
export async function scanSources(sourceDir: string): Promise<string[]> {
  try {
    const entries = await readdir(sourceDir)
    return entries
      .filter(f => /\.(tsx|ts)$/.test(f) && !f.endsWith('.server.ts'))
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

// A bundle is stale if its `.js` is missing, or the source — or any `.server.ts`
// it imports (whose RPC stubs are inlined) — is newer than the built output.
async function needsRebuild(buildDir: string, name: string, srcPath: string): Promise<boolean> {
  const built = Bun.file(join(buildDir, `${name}.js`))
  if (!(await built.exists())) return true
  let sourceMtime = Bun.file(srcPath).lastModified
  const source = await Bun.file(srcPath).text()
  for (const specifier of scanServerImports(source)) {
    const serverFile = Bun.file(join(dirname(srcPath), `${specifier}.server.ts`))
    if (await serverFile.exists()) {
      sourceMtime = Math.max(sourceMtime, serverFile.lastModified)
    }
  }
  return sourceMtime >= built.lastModified
}

export async function listBuilt(buildDir: string): Promise<string[]> {
  try {
    const entries = await readdir(buildDir)
    return entries.filter(f => f.endsWith('.js')).map(f => f.replace(/\.js$/, ''))
  } catch {
    return []
  }
}

async function pruneStaleBuilds(buildDir: string, sourceNames: Set<string>): Promise<void> {
  for (const name of await listBuilt(buildDir)) {
    if (!sourceNames.has(name)) {
      try {
        await unlink(join(buildDir, `${name}.js`))
      } catch {}
    }
  }
}

// Serve one compiled bundle (the ESM the client dynamic-imports).
export async function serveApplet(
  kind: AppletKind,
  name: string,
  workspacePath: string
): Promise<Response> {
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    return new Response('Invalid name', { status: 400 })
  }
  const { buildDir } = getAppletPaths(workspacePath, kind)
  const file = Bun.file(join(buildDir, `${name}.js`))
  if (!(await file.exists())) {
    return new Response(`"${name}" not built. Run: moi bundle`, { status: 404 })
  }
  return new Response(file, { headers: { 'Content-Type': 'application/javascript' } })
}

export type AppletBuildResult<C> = {
  name: string
  status: 'built' | 'skipped' | 'failed'
  error?: string
  serverModules?: string[]
  config?: C | null
}

// Build every stale (or all, when `force`) source for one kind: prunes orphaned
// builds, writes fresh `.js` outputs, and returns per-entry results with the
// parsed config and server-module names. Manifest persistence and MEI
// broadcasting are the caller's responsibility — they differ per kind.
export async function buildApplets<C>(
  workspacePath: string,
  kind: AppletKind,
  force: boolean
): Promise<{ names: string[]; results: AppletBuildResult<C>[]; ms: number }> {
  const t0 = performance.now()
  const { sourceDir, buildDir, moiRoot } = getAppletPaths(workspacePath, kind)
  const names = await scanSources(sourceDir)

  await mkdir(buildDir, { recursive: true })
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
        await Bun.write(join(buildDir, `${job.name}.js`), artifact.js)
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
