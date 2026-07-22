import { existsSync } from 'node:fs'

import type { ViewConfig, ViewInfo, WorkspaceTabInfo } from '@/lib/types'

import { syncAppletLogAfterBuild } from './applet-log'
import { buildApplets, getAppletPaths, listBuilt, scanSources, serveApplet } from './applets'
import { reloadModules } from './functions'
import { markViewBuilderReady } from './view-builders'

// The view applet kind. Sources in `.moi/views/`, compiled output + manifest in
// `.moi/.build/views/`; the shared mechanics live in `applets.ts`. Manifest
// shape: `{ config: { <name>: ViewConfig }, order: [<name>, …] }`. `order` is the nav
// tab order — first-seen (creation) order, persisted so it's stable across
// rebuilds (the filesystem can't recover creation order).
type ViewManifest = {
  config: Record<string, ViewConfig>
  order: string[]
}

async function readManifest(workspacePath: string): Promise<ViewManifest> {
  const { manifestPath } = getAppletPaths(workspacePath, 'view')
  try {
    const data = JSON.parse(await Bun.file(manifestPath).text())
    return { config: data.config ?? {}, order: Array.isArray(data.order) ? data.order : [] }
  } catch {
    return { config: {}, order: [] }
  }
}

async function writeManifest(workspacePath: string, manifest: ViewManifest): Promise<void> {
  const { manifestPath } = getAppletPaths(workspacePath, 'view')
  await Bun.write(manifestPath, JSON.stringify(manifest, null, 2))
}

// Keep existing order, drop deleted names, append newly-seen names in scan
// order — so a view holds its tab position once it first appears. Exported for
// testing.
export function reconcileOrder(prevOrder: string[], names: string[]): string[] {
  const present = new Set(names)
  const kept = prevOrder.filter(n => present.has(n))
  const keptSet = new Set(kept)
  const appended = names.filter(n => !keptSet.has(n))
  return [...kept, ...appended]
}

export type ViewBuildResult = {
  name: string
  status: 'built' | 'skipped' | 'failed'
  error?: string
  serverModules?: string[]
  config?: ViewConfig | null
}

export async function buildAllViews(
  workspacePath: string,
  force = false
): Promise<ViewBuildResult[]> {
  const { names, results, ms } = await buildApplets<ViewConfig>(workspacePath, 'view', force)

  const manifest = await readManifest(workspacePath)
  for (const r of results) {
    if (r.status === 'built') manifest.config[r.name] = r.config ?? {}
  }
  for (const key of Object.keys(manifest.config)) {
    if (!names.includes(key)) delete manifest.config[key]
  }
  manifest.order = reconcileOrder(manifest.order, names)
  // Persist only when there's a build dir to hold the manifest — see the note in
  // `widgets.ts`. Keeps an applet-less workspace a no-op on disk.
  const { buildDir } = getAppletPaths(workspacePath, 'view')
  if (existsSync(buildDir)) await writeManifest(workspacePath, manifest)

  const builtCount = results.filter(r => r.status === 'built').length
  const failed = results.filter(r => r.status === 'failed')
  console.log(
    `[bundle] ${builtCount}/${names.length} views built in ${ms}ms` +
      (failed.length ? `, ${failed.length} failed` : '') +
      (force ? ' (forced)' : '')
  )
  for (const r of failed) {
    console.error(`[bundle] ${r.name}:\n${r.error}`)
  }

  return results
}

function listBuiltViews(workspacePath: string): Promise<string[]> {
  const { buildDir } = getAppletPaths(workspacePath, 'view')
  return listBuilt(buildDir)
}

// Built views in manifest order, with `title` resolved (falls back to the id).
export async function getViewList(workspacePath: string): Promise<ViewInfo[]> {
  const [built, manifest] = await Promise.all([
    listBuiltViews(workspacePath),
    readManifest(workspacePath)
  ])
  const builtSet = new Set(built)
  // Manifest order first (filtered to what's actually built), then any built
  // view missing from order (shouldn't happen, but never drop a real bundle).
  const ordered = [
    ...manifest.order.filter(id => builtSet.has(id)),
    ...built.filter(id => !manifest.order.includes(id))
  ]
  return ordered.map(id => {
    const raw = manifest.config[id] ?? {}
    const icon = typeof raw.icon === 'string' && raw.icon ? raw.icon : undefined
    const requiredEnv = Array.isArray(raw.requiredEnv) ? raw.requiredEnv : undefined
    const params =
      raw.params && typeof raw.params === 'object' && Object.keys(raw.params).length > 0
        ? raw.params
        : undefined
    return {
      id,
      config: {
        title: raw.title || id,
        ...(icon ? { icon } : {}),
        ...(requiredEnv ? { requiredEnv } : {}),
        ...(params ? { params } : {})
      }
    }
  })
}

// The `moi tabs` manifest: the static tabs plus one row per built view (nav
// order), each view carrying its declared focus params. Pure assembly from a
// view list so it unit-tests without a workspace on disk.
export function assembleWorkspaceTabs(views: ViewInfo[]): WorkspaceTabInfo[] {
  return [
    { id: 'agent', title: 'Agent' },
    { id: 'widgets', title: 'Widgets' },
    { id: 'scratchpad', title: 'Scratchpad' },
    ...views.map<WorkspaceTabInfo>(view => ({
      id: `view:${view.id}`,
      title: view.config.title || view.id,
      ...(view.config.params ? { params: view.config.params } : {})
    }))
  ]
}

export async function hasViewId(workspacePath: string, viewId: string): Promise<boolean> {
  const { sourceDir } = getAppletPaths(workspacePath, 'view')
  const [sources, built] = await Promise.all([
    scanSources(sourceDir),
    listBuiltViews(workspacePath)
  ])
  return sources.includes(viewId) || built.includes(viewId)
}

// Env keys declared via view `config.requiredEnv`, keyed to the view ids that
// asked. Merged with the widget map in the env API's "required" view.
export async function collectViewRequiredEnv(
  workspacePath: string
): Promise<Record<string, string[]>> {
  const { config } = await readManifest(workspacePath)
  const out: Record<string, string[]> = {}
  for (const [id, cfg] of Object.entries(config)) {
    if (!Array.isArray(cfg.requiredEnv)) continue
    for (const key of cfg.requiredEnv) {
      ;(out[key] ??= []).push(id)
    }
  }
  return out
}

export async function listViews(workspacePath: string): Promise<Response> {
  return Response.json({ views: await getViewList(workspacePath) })
}

export async function handleBundleViews(
  publish: (msg: unknown) => void,
  workspaceId: string,
  workspacePath: string,
  force = false,
  // When set, compile without advancing any view builder to `ready` (the
  // `moi bundle --no-status` opt-out). The build still publishes `view:updated`.
  skipStatus = false
) {
  const before = await readManifest(workspacePath)
  const beforeBuilt = new Set(await listBuiltViews(workspacePath))
  const results = await buildAllViews(workspacePath, force)
  const after = await readManifest(workspacePath)
  const afterBuilt = new Set(await listBuiltViews(workspacePath))

  // Keep the applet error journal honest: record build failures, clear entries
  // superseded by a successful rebuild (see docs/self-correction.md).
  syncAppletLogAfterBuild(workspacePath, 'view', results)

  const identityChanged = results.some(
    r =>
      r.status === 'built' &&
      ((before.config[r.name]?.title ?? '') !== (r.config?.title ?? '') ||
        (before.config[r.name]?.icon ?? '') !== (r.config?.icon ?? ''))
  )
  const orderChanged = before.order.join('\0') !== after.order.join('\0')
  const membershipChanged =
    beforeBuilt.size !== afterBuilt.size ||
    [...beforeBuilt].some(n => !afterBuilt.has(n)) ||
    [...afterBuilt].some(n => !beforeBuilt.has(n))

  const changedServerModules = new Set<string>()
  for (const r of results) {
    if (r.status === 'built') {
      publish({ type: 'view:updated', name: r.name, config: r.config ?? null })
      if (!skipStatus) {
        await markViewBuilderReady(
          workspaceId,
          workspacePath,
          r.name,
          r.config?.title || r.name,
          r.config?.icon
        )
      }
      for (const m of r.serverModules ?? []) changedServerModules.add(m)
    }
  }

  if (changedServerModules.size > 0) {
    reloadModules([...changedServerModules], workspacePath)
  }

  const views = await getViewList(workspacePath)
  if (identityChanged || orderChanged || membershipChanged) {
    publish({ type: 'view-layout:updated', views })
  }

  return results
}

export function serveView(
  name: string,
  file: string,
  workspacePath: string,
  apiBase: string,
  ifNoneMatch?: string | null
): Promise<Response> {
  return serveApplet('view', name, file, workspacePath, apiBase, ifNoneMatch)
}
