import { mkdir, readdir, unlink } from 'node:fs/promises'
import { join } from 'path'

import { buildWidget } from './build-widget'
import { reloadModules } from './functions'

const MEI_DIR = join(import.meta.dir, '..', 'workspace', 'mei')
const SOURCE_DIR = MEI_DIR
const BUILD_DIR = join(MEI_DIR, '.build', 'widgets')

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
}

export async function buildAllWidgets(): Promise<WidgetBuildResult[]> {
  const names = await scanWidgets()
  const results: WidgetBuildResult[] = []

  await mkdir(BUILD_DIR, { recursive: true })
  await pruneStaleBuilds(new Set(names))

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

      results.push({
        name,
        status: 'built',
        serverModules: artifact.serverModules.map(m => m.name)
      })
    } catch (err) {
      results.push({
        name,
        status: 'failed',
        error: err instanceof Error ? err.message : 'Unknown error'
      })
    }
  }

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

export async function listWidgets(): Promise<Response> {
  const widgets = await scanWidgets()
  return Response.json({ widgets })
}

export async function handleBundle(publish: (msg: unknown) => void) {
  const before = new Set(await listBuiltWidgets())
  const results = await buildAllWidgets()
  const after = new Set(await listBuiltWidgets())

  const layoutChanged =
    before.size !== after.size ||
    [...before].some(n => !after.has(n)) ||
    [...after].some(n => !before.has(n))

  const changedServerModules = new Set<string>()
  for (const r of results) {
    if (r.status === 'built') {
      publish({ type: 'widget:updated', name: r.name })
      for (const m of r.serverModules ?? []) changedServerModules.add(m)
    }
  }

  if (changedServerModules.size > 0) {
    reloadModules([...changedServerModules])
  }

  if (layoutChanged) {
    publish({ type: 'widget-layout:updated' })
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
