import envPaths from 'env-paths'
import { mkdir } from 'node:fs/promises'
import { join, resolve } from 'path'

import type { WorkspaceEntry } from '@/lib/types'

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

export async function registerWorkspace(absPath: string): Promise<WorkspaceEntry> {
  const normalPath = resolve(absPath)
  const entries = await readRegistry()
  const existing = entries.find(e => e.path === normalPath)
  if (existing) return existing
  const entry: WorkspaceEntry = {
    id: crypto.randomUUID(),
    path: normalPath,
    addedAt: new Date().toISOString()
  }
  await writeRegistry([...entries, entry])
  return entry
}

export async function getWorkspace(id: string): Promise<WorkspaceEntry | null> {
  const entries = await readRegistry()
  return entries.find(e => e.id === id) ?? null
}

export async function listWorkspaces(): Promise<WorkspaceEntry[]> {
  return readRegistry()
}

// Discover CC-active directories not yet in the registry
export async function discoverFromCC(): Promise<string[]> {
  const { listSessions } = await import('@anthropic-ai/claude-agent-sdk')
  const registeredPaths = new Set((await listWorkspaces()).map(e => e.path))

  try {
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
