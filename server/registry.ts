import { mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve, sep } from 'path'

import { newWorkspaceId } from '@/lib/ids'
import type { DiscoveredWorkspace, WorkspaceEntry, WorkspaceType } from '@/lib/types'
import { orderWorkspaceTypes } from '@/lib/workspace-types'

import { DATA_DIR } from './data-dir'
import { allHarnesses } from './harness/registry'
import type { DiscoveredWorkspaceCandidate } from './harness/types'

// Replace the home-dir prefix with `~` for display. Keeps the original
// absolute path in place; callers should put the result in `displayPath`.
export function tildify(absPath: string): string {
  const home = homedir()
  if (!home) return absPath
  if (absPath === home) return '~'
  const prefix = home.endsWith('/') ? home : home + '/'
  if (absPath.startsWith(prefix)) return '~/' + absPath.slice(prefix.length)
  return absPath
}

function withDisplayPath<T extends { path: string }>(entry: T): T & { displayPath: string } {
  return { ...entry, displayPath: tildify(entry.path) }
}

export const DEFAULT_REGISTRY_PATH = join(DATA_DIR, 'workspaces.json')

// Overridable for tests
let _registryPath = DEFAULT_REGISTRY_PATH
export function setRegistryPath(p: string) {
  _registryPath = p
}

async function readRegistry(): Promise<WorkspaceEntry[]> {
  try {
    const text = await Bun.file(_registryPath).text()
    return JSON.parse(text) as WorkspaceEntry[]
  } catch {
    return []
  }
}

async function writeRegistry(entries: WorkspaceEntry[]): Promise<void> {
  await mkdir(join(_registryPath, '..'), { recursive: true })
  await Bun.write(_registryPath, JSON.stringify(entries, null, 2))
}

export type RegisterOptions = {
  type?: WorkspaceType
  name?: string
  agentId?: string
  isDefault?: boolean
  lastRunAt?: string
}

export async function registerWorkspace(
  absPath: string,
  opts: RegisterOptions = {}
): Promise<WorkspaceEntry> {
  const normalPath = resolve(absPath)
  const entries = await readRegistry()
  const existing = entries.find(e => e.path === normalPath)
  if (existing) return existing
  const entry: WorkspaceEntry = {
    id: newWorkspaceId(),
    path: normalPath,
    addedAt: new Date().toISOString(),
    ...(opts.type ? { type: opts.type } : {}),
    ...(opts.name ? { name: opts.name } : {}),
    ...(opts.agentId ? { agentId: opts.agentId } : {}),
    ...(opts.isDefault ? { isDefault: opts.isDefault } : {}),
    ...(opts.lastRunAt ? { lastRunAt: opts.lastRunAt } : {})
  }
  await writeRegistry([entry, ...entries])
  return withDisplayPath(entry)
}

export async function getWorkspace(id: string): Promise<WorkspaceEntry | null> {
  const entries = await readRegistry()
  return entries.find(e => e.id === id) ?? null
}

export async function removeWorkspace(id: string): Promise<boolean> {
  const entries = await readRegistry()
  const next = entries.filter(e => e.id !== id)
  if (next.length === entries.length) return false
  await writeRegistry(next)
  return true
}

export async function listWorkspaces(): Promise<WorkspaceEntry[]> {
  const entries = await readRegistry()
  return entries.map(withDisplayPath)
}

export async function reorderWorkspaces(ids: string[]): Promise<WorkspaceEntry[]> {
  const entries = await readRegistry()
  if (ids.length !== entries.length) throw new Error('Workspace order must include every workspace')

  const unique = new Set(ids)
  if (unique.size !== ids.length) throw new Error('Workspace order contains duplicate ids')

  const byId = new Map(entries.map(e => [e.id, e]))
  const next = ids.map(id => byId.get(id))
  if (next.some(e => !e)) throw new Error('Workspace order contains unknown ids')

  const ordered = next as WorkspaceEntry[]
  await writeRegistry(ordered)
  return ordered.map(withDisplayPath)
}

// Resolve a path to the registered workspace that *contains* it: the entry
// whose path equals `reqPath` or is its nearest ancestor (longest matching
// prefix, git-style). This lets workspace-scoped commands (e.g. `moi bundle`)
// run from `.moi/` or any subdirectory and still target the real root, instead
// of treating the CWD as a workspace and scaffolding a phantom nested `.moi/`.
// Returns null when the path is not inside any registered workspace.
export function findWorkspaceForPath<T extends { path: string }>(
  workspaces: T[],
  reqPath: string
): T | null {
  const normal = resolve(reqPath)
  const matches = workspaces.filter(w => normal === w.path || normal.startsWith(w.path + sep))
  if (matches.length === 0) return null
  return matches.reduce((best, w) => (w.path.length > best.path.length ? w : best))
}

// If `p` lies inside a workspace's `.moi/` directory, return the workspace root
// (the directory that contains that `.moi`); otherwise return `p` unchanged.
// Cuts at the FIRST `.moi` segment, so an accidentally-nested `.moi/.moi/…`
// path lifts all the way back to the real root. Pure (no filesystem access) —
// `moi init` uses it so running from inside `.moi` never creates a nested
// workspace, and the command always targets the real workspace root.
export function liftToWorkspaceRoot(p: string): string {
  const normal = resolve(p)
  const segments = normal.split(sep)
  const i = segments.indexOf('.moi')
  if (i === -1) return normal
  return segments.slice(0, i).join(sep) || sep
}

async function collectDiscoveredWorkspaces(
  registeredPaths: Set<string>
): Promise<DiscoveredWorkspaceCandidate[]> {
  const perHarness = await Promise.all(
    allHarnesses().map(
      h => h.discoverWorkspaces?.(registeredPaths).catch(() => []) ?? Promise.resolve([])
    )
  )
  return perHarness.flat()
}

export function groupDiscoveredWorkspaces(
  candidates: DiscoveredWorkspaceCandidate[],
  registeredPaths: Set<string> = new Set()
): DiscoveredWorkspace[] {
  const normalizedRegisteredPaths = new Set([...registeredPaths].map(path => resolve(path)))
  const byPath = new Map<string, Set<WorkspaceType>>()

  for (const candidate of candidates) {
    const path = resolve(candidate.path)
    if (normalizedRegisteredPaths.has(path)) continue
    const types = byPath.get(path) ?? new Set<WorkspaceType>()
    types.add(candidate.type)
    byPath.set(path, types)
  }

  return [...byPath].map(([path, types]) => ({
    path,
    types: orderWorkspaceTypes(types)
  }))
}

export function discoveredWorkspaceForPath(
  path: string,
  candidates: DiscoveredWorkspaceCandidate[]
): DiscoveredWorkspace {
  const normalizedPath = resolve(path)
  return (
    groupDiscoveredWorkspaces(candidates).find(workspace => workspace.path === normalizedPath) ?? {
      path: normalizedPath,
      types: []
    }
  )
}

// Ask every harness for workspaces it knows about that aren't registered yet,
// then combine providers that claim the same normalized folder.
export async function discoverWorkspaces(): Promise<DiscoveredWorkspace[]> {
  const registeredPaths = new Set((await readRegistry()).map(e => e.path))
  const found = await collectDiscoveredWorkspaces(registeredPaths)
  return groupDiscoveredWorkspaces(found, registeredPaths).map(withDisplayPath)
}

// Inspect one folder through the same provider discovery used by the home
// suggestions. An empty types list means no provider recognized the folder.
export async function discoverWorkspace(path: string): Promise<DiscoveredWorkspace> {
  const found = await collectDiscoveredWorkspaces(new Set())
  return withDisplayPath(discoveredWorkspaceForPath(path, found))
}
