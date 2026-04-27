import { mkdir, readdir, unlink } from 'node:fs/promises'
import { join } from 'path'

import type { WidgetConfig, WidgetInfo } from '@/lib/types'

import { buildWidget } from './build-widget'
import { reloadModules } from './functions'

const DEFAULT_CONFIG: WidgetConfig = { rowSpan: 1, colSpan: 2 }
const VALID_SPANS = [1, 2, 3, 4]

function getWidgetPaths(workspacePath: string) {
  const sourceDir = join(workspacePath, '.widgets')
  const buildDir = join(sourceDir, '.build', 'widgets')
  const manifestPath = join(buildDir, 'manifest.json')
  return { sourceDir, buildDir, manifestPath }
}

async function readManifest(workspacePath: string): Promise<Record<string, WidgetConfig>> {
  const { manifestPath } = getWidgetPaths(workspacePath)
  try {
    const data = JSON.parse(await Bun.file(manifestPath).text())
    return data.config ?? {}
  } catch {
    return {}
  }
}

async function writeManifest(
  workspacePath: string,
  configs: Record<string, WidgetConfig>
): Promise<void> {
  const { manifestPath } = getWidgetPaths(workspacePath)
  await Bun.write(manifestPath, JSON.stringify({ config: configs }, null, 2))
}

async function scanWidgets(workspacePath: string): Promise<string[]> {
  const { sourceDir } = getWidgetPaths(workspacePath)
  try {
    const entries = await readdir(sourceDir)
    return entries
      .filter(f => /\.(tsx|ts)$/.test(f) && !f.endsWith('.server.ts'))
      .map(f => f.replace(/\.tsx?$/, ''))
  } catch {
    return []
  }
}

async function resolveWidgetSource(workspacePath: string, name: string): Promise<string | null> {
  const { sourceDir } = getWidgetPaths(workspacePath)
  for (const ext of ['.tsx', '.ts']) {
    const path = join(sourceDir, `${name}${ext}`)
    if (await Bun.file(path).exists()) return path
  }
  return null
}

async function needsRebuild(
  workspacePath: string,
  name: string,
  srcPath: string
): Promise<boolean> {
  const { sourceDir, buildDir } = getWidgetPaths(workspacePath)
  const built = Bun.file(join(buildDir, `${name}.js`))
  if (!(await built.exists())) return true
  // Also stat the sibling `<name>.server.ts` if it exists. The main `.tsx`
  // imports `./<name>.server` and the build inlines RPC stubs for its
  // exports, so a server-only edit must trigger a rebuild — but its mtime
  // lives on a different file than `srcPath`.
  const serverPath = join(sourceDir, `${name}.server.ts`)
  const serverFile = Bun.file(serverPath)
  const serverMtime = (await serverFile.exists()) ? serverFile.lastModified : 0
  const sourceMtime = Math.max(Bun.file(srcPath).lastModified, serverMtime)
  return sourceMtime >= built.lastModified
}

async function pruneStaleBuilds(workspacePath: string, sourceNames: Set<string>) {
  const built = await listBuiltWidgets(workspacePath)
  const { buildDir } = getWidgetPaths(workspacePath)
  for (const name of built) {
    if (!sourceNames.has(name)) {
      try {
        await unlink(join(buildDir, `${name}.js`))
      } catch {}
    }
  }
}

export type WidgetBuildResult = {
  name: string
  status: 'built' | 'skipped' | 'failed'
  error?: string
  serverModules?: string[]
  config?: WidgetConfig | null
}

export async function buildAllWidgets(
  workspacePath: string,
  force = false
): Promise<WidgetBuildResult[]> {
  const t0 = performance.now()
  const { buildDir } = getWidgetPaths(workspacePath)
  const names = await scanWidgets(workspacePath)

  await mkdir(buildDir, { recursive: true })
  await pruneStaleBuilds(workspacePath, new Set(names))

  const manifest = await readManifest(workspacePath)

  const jobs = await Promise.all(
    names.map(async name => {
      const srcPath = await resolveWidgetSource(workspacePath, name)
      if (!srcPath) {
        return { name, status: 'failed' as const, error: 'Source file not found' }
      }
      if (!force && !(await needsRebuild(workspacePath, name, srcPath))) {
        return { name, status: 'skipped' as const }
      }
      return { name, srcPath, status: 'pending' as const }
    })
  )

  const buildResults = await Promise.all(
    jobs.map(async (job): Promise<WidgetBuildResult> => {
      if (job.status === 'failed') return { name: job.name, status: 'failed', error: job.error }
      if (job.status === 'skipped') return { name: job.name, status: 'skipped' }

      const { buildDir: bd } = getWidgetPaths(workspacePath)
      try {
        const artifact = await buildWidget(job.srcPath!)
        await Bun.write(join(bd, `${job.name}.js`), artifact.js)
        manifest[job.name] = artifact.config ?? DEFAULT_CONFIG
        return {
          name: job.name,
          status: 'built',
          serverModules: artifact.serverModules.map(m => m.name),
          config: artifact.config
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

  for (const key of Object.keys(manifest)) {
    if (!names.includes(key)) delete manifest[key]
  }

  await writeManifest(workspacePath, manifest)

  const builtCount = buildResults.filter(r => r.status === 'built').length
  const failed = buildResults.filter(r => r.status === 'failed')
  console.log(
    `[bundle] ${builtCount}/${names.length} built in ${Math.round(performance.now() - t0)}ms` +
      (failed.length ? `, ${failed.length} failed` : '') +
      (force ? ' (forced)' : '')
  )
  for (const r of failed) {
    console.error(`[bundle] ${r.name}:\n${r.error}`)
  }

  return buildResults
}

export async function listBuiltWidgets(workspacePath: string): Promise<string[]> {
  const { buildDir } = getWidgetPaths(workspacePath)
  try {
    const entries = await readdir(buildDir)
    return entries.filter(f => f.endsWith('.js')).map(f => f.replace(/\.js$/, ''))
  } catch {
    return []
  }
}

async function getWidgetList(workspacePath: string): Promise<WidgetInfo[]> {
  const [names, manifest] = await Promise.all([
    listBuiltWidgets(workspacePath),
    readManifest(workspacePath)
  ])
  return names.map(id => {
    const raw = manifest[id] ?? {}
    const rowSpan = VALID_SPANS.includes(raw.rowSpan) ? raw.rowSpan : DEFAULT_CONFIG.rowSpan
    const colSpan = VALID_SPANS.includes(raw.colSpan) ? raw.colSpan : DEFAULT_CONFIG.colSpan
    return { id, config: { rowSpan, colSpan } as WidgetConfig }
  })
}

export async function listWidgets(workspacePath: string): Promise<Response> {
  return Response.json({ widgets: await getWidgetList(workspacePath) })
}

export async function handleBundle(
  publish: (msg: unknown) => void,
  workspacePath: string,
  force = false
) {
  const before = new Set(await listBuiltWidgets(workspacePath))
  const manifestBefore = await readManifest(workspacePath)
  const results = await buildAllWidgets(workspacePath, force)
  const after = new Set(await listBuiltWidgets(workspacePath))

  const configChanged = results.some(r => {
    if (r.status !== 'built' || !r.config) return false
    const old = manifestBefore[r.name]
    return !old || old.rowSpan !== r.config.rowSpan || old.colSpan !== r.config.colSpan
  })

  const layoutChanged =
    configChanged ||
    before.size !== after.size ||
    [...before].some(n => !after.has(n)) ||
    [...after].some(n => !before.has(n))

  const changedServerModules = new Set<string>()
  for (const r of results) {
    if (r.status === 'built') {
      publish({ type: 'widget:updated', name: r.name, config: r.config ?? null })
      for (const m of r.serverModules ?? []) changedServerModules.add(m)
    }
  }

  if (changedServerModules.size > 0) {
    reloadModules([...changedServerModules], workspacePath)
  }

  if (layoutChanged) {
    const widgets = await getWidgetList(workspacePath)
    publish({ type: 'widget-layout:updated', widgets })
  }

  return results
}

export async function serveWidget(name: string, workspacePath: string): Promise<Response> {
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    return new Response('Invalid widget name', { status: 400 })
  }

  const { buildDir } = getWidgetPaths(workspacePath)
  const buildPath = join(buildDir, `${name}.js`)
  const file = Bun.file(buildPath)

  if (!(await file.exists())) {
    return new Response(`Widget "${name}" not built. Run: moi bundle`, { status: 404 })
  }

  return new Response(file, {
    headers: { 'Content-Type': 'application/javascript' }
  })
}
