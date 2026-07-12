import { existsSync } from 'node:fs'

import type { WidgetConfig, WidgetInfo } from '@/lib/types'

import { buildApplets, getAppletPaths, listBuilt, serveApplet } from './applets'
import { reloadModules } from './functions'

const DEFAULT_CONFIG: WidgetConfig = { rowSpan: 1, colSpan: 2 }
const VALID_SPANS = [1, 2, 3, 4]

// The widget applet kind. Sources in `.moi/widgets/`, compiled output +
// manifest in `.moi/.build/widgets/`; the shared mechanics live in
// `applets.ts`. Manifest shape: `{ config: { <name>: WidgetConfig } }`.
async function readManifest(workspacePath: string): Promise<Record<string, WidgetConfig>> {
  const { manifestPath } = getAppletPaths(workspacePath, 'widget')
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
  const { manifestPath } = getAppletPaths(workspacePath, 'widget')
  await Bun.write(manifestPath, JSON.stringify({ config: configs }, null, 2))
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
  const { names, results, ms } = await buildApplets<WidgetConfig>(workspacePath, 'widget', force)

  const manifest = await readManifest(workspacePath)
  for (const r of results) {
    if (r.status === 'built') manifest[r.name] = r.config ?? DEFAULT_CONFIG
  }
  for (const key of Object.keys(manifest)) {
    if (!names.includes(key)) delete manifest[key]
  }
  // Persist only when there's a build dir to hold the manifest. `buildApplets`
  // creates it only when ≥1 source exists; skipping the write here keeps a
  // workspace with no widgets a true no-op on disk (no scaffolded `.build/`),
  // while a previously-built workspace whose sources were all deleted still gets
  // its emptied manifest rewritten.
  const { buildDir } = getAppletPaths(workspacePath, 'widget')
  if (existsSync(buildDir)) await writeManifest(workspacePath, manifest)

  const builtCount = results.filter(r => r.status === 'built').length
  const failed = results.filter(r => r.status === 'failed')
  console.log(
    `[bundle] ${builtCount}/${names.length} widgets built in ${ms}ms` +
      (failed.length ? `, ${failed.length} failed` : '') +
      (force ? ' (forced)' : '')
  )
  for (const r of failed) {
    console.error(`[bundle] ${r.name}:\n${r.error}`)
  }

  return results
}

export function listBuiltWidgets(workspacePath: string): Promise<string[]> {
  const { buildDir } = getAppletPaths(workspacePath, 'widget')
  return listBuilt(buildDir)
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
    const requiredEnv = Array.isArray(raw.requiredEnv) ? raw.requiredEnv : undefined
    return {
      id,
      config: { rowSpan, colSpan, ...(requiredEnv ? { requiredEnv } : {}) } as WidgetConfig
    }
  })
}

// Collect env vars declared via widget `config.requiredEnv`, mapping each key to
// the widget ids that asked for it. Feeds the env API's "required" view.
export async function collectRequiredEnv(workspacePath: string): Promise<Record<string, string[]>> {
  const manifest = await readManifest(workspacePath)
  const out: Record<string, string[]> = {}
  for (const [id, cfg] of Object.entries(manifest)) {
    if (!Array.isArray(cfg.requiredEnv)) continue
    for (const key of cfg.requiredEnv) {
      ;(out[key] ??= []).push(id)
    }
  }
  return out
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

export function serveWidget(
  name: string,
  file: string,
  workspacePath: string,
  apiBase: string,
  ifNoneMatch?: string | null
): Promise<Response> {
  return serveApplet('widget', name, file, workspacePath, apiBase, ifNoneMatch)
}
