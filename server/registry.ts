import envPaths from 'env-paths'
import { mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve, sep } from 'path'

import type { DiscoveredWorkspace, WorkspaceEntry, WorkspaceType } from '@/lib/types'

import { type OpenClawAgent, discoverOpenClawAgents } from './openclaw'

// Replace the home-dir prefix with `~` for display. Keeps the original
// absolute path in place; callers should put the result in `displayPath`.
function tildify(absPath: string): string {
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

const DATA_DIR = envPaths('moi', { suffix: false }).data
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
    id: crypto.randomUUID(),
    path: normalPath,
    addedAt: new Date().toISOString(),
    ...(opts.type ? { type: opts.type } : {}),
    ...(opts.name ? { name: opts.name } : {}),
    ...(opts.agentId ? { agentId: opts.agentId } : {}),
    ...(opts.isDefault ? { isDefault: opts.isDefault } : {}),
    ...(opts.lastRunAt ? { lastRunAt: opts.lastRunAt } : {})
  }
  await writeRegistry([...entries, entry])
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

// Discover CC-active directories not yet in the registry
async function discoverFromCC(registeredPaths: Set<string>): Promise<string[]> {
  try {
    const { listSessions } = await import('@anthropic-ai/claude-agent-sdk')
    const sessions = await listSessions({})
    const { stat } = await import('node:fs/promises')
    const paths = new Set<string>()

    for (const s of sessions) {
      if (!s.cwd || registeredPaths.has(s.cwd)) continue
      try {
        const info = await stat(s.cwd)
        if (info.isDirectory()) paths.add(s.cwd)
      } catch {}
    }

    return [...paths]
  } catch {
    return []
  }
}

// Discover OpenClaw agents via the gateway WebSocket (2s timeout). Returns []
// if the gateway is unreachable, auth is missing, or probes time out.
async function discoverFromOpenClaw(registeredPaths: Set<string>): Promise<OpenClawAgent[]> {
  const agents = await discoverOpenClawAgents()
  return agents.filter(a => !registeredPaths.has(a.path))
}

export async function discoverWorkspaces(): Promise<DiscoveredWorkspace[]> {
  const registeredPaths = new Set((await readRegistry()).map(e => e.path))
  const [ccPaths, openclawAgents] = await Promise.all([
    discoverFromCC(registeredPaths),
    discoverFromOpenClaw(registeredPaths)
  ])
  const openclawByPath = new Map(openclawAgents.map(a => [a.path, a]))
  const out: DiscoveredWorkspace[] = []
  for (const a of openclawAgents) {
    out.push(
      withDisplayPath({
        path: a.path,
        type: 'openclaw',
        ...(a.name ? { name: a.name } : {}),
        ...(a.agentId ? { agentId: a.agentId } : {}),
        ...(a.isDefault ? { isDefault: a.isDefault } : {}),
        ...(a.lastRunAt ? { lastRunAt: a.lastRunAt } : {})
      })
    )
  }
  for (const p of ccPaths) {
    if (openclawByPath.has(p)) continue
    out.push(withDisplayPath({ path: p, type: 'claude-code' }))
  }
  return out
}
