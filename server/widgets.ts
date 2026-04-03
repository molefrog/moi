import { mkdir, readdir, unlink } from 'node:fs/promises'
import { join } from 'path'

import type { WidgetConfig, WidgetInfo } from '@/lib/types'

import { buildWidget } from './build-widget'
import { reloadModules } from './functions'

const MEI_DIR = join(import.meta.dir, '..', 'workspace', 'mei')
const SOURCE_DIR = MEI_DIR
const BUILD_DIR = join(MEI_DIR, '.build', 'widgets')
const MANIFEST_PATH = join(BUILD_DIR, 'manifest.json')

const DEFAULT_CONFIG: WidgetConfig = { rowSpan: 1, colSpan: 2 }
const VALID_SPANS = [1, 2, 3, 4]

async function readManifest(): Promise<Record<string, WidgetConfig>> {
  try {
    const data = JSON.parse(await Bun.file(MANIFEST_PATH).text())
    return data.config ?? {}
  } catch {
    return {}
  }
}

async function writeManifest(configs: Record<string, WidgetConfig>): Promise<void> {
  await Bun.write(MANIFEST_PATH, JSON.stringify({ config: configs }, null, 2))
}

async function scanWidgets(): Promise<string[]> {
  try {
    const entries = await readdir(SOURCE_DIR)
    return entries
      .filter(f => /\.(tsx|ts)$/.test(f) && !f.endsWith('.server.ts'))
      .map(f => f.replace(/\.tsx?$/, ''))
  } catch {
    return []
  }
}

async function resolveWidgetSource(name: string): Promise<string | null> {
  for (const ext of ['.tsx', '.ts']) {
    const path = join(SOURCE_DIR, `${name}${ext}`)
    if (await Bun.file(path).exists()) return path
  }
  return null
}

async function needsRebuild(name: string, srcPath: string): Promise<boolean> {
  const built = Bun.file(join(BUILD_DIR, `${name}.js`))
  if (!(await built.exists())) return true
  return Bun.file(srcPath).lastModified >= built.lastModified
}

// Remove built files that no longer have a source
async function pruneStaleBuilds(sourceNames: Set<string>) {
  const built = await listBuiltWidgets()
  for (const name of built) {
    if (!sourceNames.has(name)) {
      try {
        await unlink(join(BUILD_DIR, `${name}.js`))
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

export async function buildAllWidgets(): Promise<WidgetBuildResult[]> {
  const names = await scanWidgets()
  const results: WidgetBuildResult[] = []

  await mkdir(BUILD_DIR, { recursive: true })
  await pruneStaleBuilds(new Set(names))

  const manifest = await readManifest()

  for (const name of names) {
    const srcPath = await resolveWidgetSource(name)
    if (!srcPath) {
      results.push({ name, status: 'failed', error: 'Source file not found' })
      continue
    }

    if (!(await needsRebuild(name, srcPath))) {
      results.push({ name, status: 'skipped' })
      continue
    }

    try {
      const artifact = await buildWidget(srcPath)
      await Bun.write(join(BUILD_DIR, `${name}.js`), artifact.js)

      manifest[name] = artifact.config ?? DEFAULT_CONFIG

      results.push({
        name,
        status: 'built',
        serverModules: artifact.serverModules.map(m => m.name),
        config: artifact.config
      })
    } catch (err) {
      results.push({
        name,
        status: 'failed',
        error: err instanceof Error ? err.message : 'Unknown error'
      })
    }
  }

  // Prune manifest entries for deleted widgets
  for (const key of Object.keys(manifest)) {
    if (!names.includes(key)) delete manifest[key]
  }

  await writeManifest(manifest)

  return results
}

export async function listBuiltWidgets(): Promise<string[]> {
  try {
    const entries = await readdir(BUILD_DIR)
    return entries.filter(f => f.endsWith('.js')).map(f => f.replace(/\.js$/, ''))
  } catch {
    return []
  }
}

async function getWidgetList(): Promise<WidgetInfo[]> {
  const [names, manifest] = await Promise.all([scanWidgets(), readManifest()])
  return names.map(id => {
    const raw = manifest[id] ?? {}
    const rowSpan = VALID_SPANS.includes(raw.rowSpan) ? raw.rowSpan : DEFAULT_CONFIG.rowSpan
    const colSpan = VALID_SPANS.includes(raw.colSpan) ? raw.colSpan : DEFAULT_CONFIG.colSpan
    return { id, config: { rowSpan, colSpan } as WidgetConfig }
  })
}

export async function listWidgets(): Promise<Response> {
  return Response.json({ widgets: await getWidgetList() })
}

export async function handleBundle(publish: (msg: unknown) => void) {
  const before = new Set(await listBuiltWidgets())
  const manifestBefore = await readManifest()
  const results = await buildAllWidgets()
  const after = new Set(await listBuiltWidgets())

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
    reloadModules([...changedServerModules])
  }

  if (layoutChanged) {
    const widgets = await getWidgetList()
    publish({ type: 'widget-layout:updated', widgets })
  }

  return results
}

export async function serveWidget(name: string): Promise<Response> {
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    return new Response('Invalid widget name', { status: 400 })
  }

  const buildPath = join(BUILD_DIR, `${name}.js`)
  const file = Bun.file(buildPath)

  if (!(await file.exists())) {
    return new Response(`Widget "${name}" not built. Run: ./mei/cmd bundle`, {
      status: 404
    })
  }

  return new Response(file, {
    headers: { 'Content-Type': 'application/javascript' }
  })
}
