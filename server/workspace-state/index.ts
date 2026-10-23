// Moi's per-workspace state, one `state.json` per workspace id under
// `DATA_DIR/workspaces/`. Reads come from a write-through cache: the server is
// the only process that writes these files (the CLI goes through the control
// port), so the cache never goes stale. Writes for one workspace run one at a
// time, each as a synchronous change applied to a copy and saved atomically.
// Every saved change is published to browsers as `state:changed`.
import { existsSync } from 'node:fs'
import { readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'

import type { WorkspaceState } from '@/lib/types'
import { DATA_DIR } from '../data-dir'
import { publishEvent } from '../events'
import {
  compactWorkspaceState,
  emptyWorkspaceState,
  readStateFile,
  writeStateFile,
  WorkspaceStateVersionError,
  type LoadedState
} from './file'
import { createKeyedLock } from './lock'
import type { StoredWorkspaceState, WorkspaceRef } from './types'

export { LockTimeoutError } from './lock'
export { WorkspaceStateVersionError } from './file'
export type { StoredWorkspaceState, WorkspaceRef } from './types'

const STATE_FILE = 'state.json'
// Long enough for a slow disk, short enough that one stuck write does not
// freeze the workspace's chats.
const LOCK_TIMEOUT_MS = 10_000

export const DEFAULT_WORKSPACE_STATE_ROOT = join(DATA_DIR, 'workspaces')

let root = DEFAULT_WORKSPACE_STATE_ROOT
const cache = new Map<string, Promise<LoadedState>>()
const withLock = createKeyedLock(LOCK_TIMEOUT_MS)

// Test seam: keep state in a scratch folder.
export function setWorkspaceStateRoot(dir: string): void {
  root = dir
  cache.clear()
}

function statePath(workspaceId: string): string {
  return join(root, workspaceId, STATE_FILE)
}

function load(ws: WorkspaceRef): Promise<LoadedState> {
  let loaded = cache.get(ws.id)
  if (!loaded) {
    const loading = readStateFile(statePath(ws.id), ws.path).then(
      found => found ?? { state: emptyWorkspaceState(ws.path), writable: true }
    )
    loading.catch(() => {
      if (cache.get(ws.id) === loading) cache.delete(ws.id)
    })
    cache.set(ws.id, loading)
    loaded = loading
  }
  return loaded
}

// A copy of the current state. Changing it changes nothing on disk.
export async function readWorkspaceState(ws: WorkspaceRef): Promise<StoredWorkspaceState> {
  return structuredClone((await load(ws)).state)
}

// The state as clients see it, without the file's bookkeeping.
export function toWorkspaceState(stored: StoredWorkspaceState): WorkspaceState {
  const { version: _version, workspacePath: _workspacePath, ...state } = stored
  return state
}

export async function getWorkspaceState(ws: WorkspaceRef): Promise<WorkspaceState> {
  return toWorkspaceState(await readWorkspaceState(ws))
}

// Applies `change` to a copy of the state and saves the result in one atomic
// write. Keep `change` synchronous and free of I/O: it runs while every other
// write to this workspace waits. Throwing from it leaves the state untouched;
// a change that leaves the state as it was skips the write.
export async function updateWorkspaceState<T>(
  ws: WorkspaceRef,
  change: (draft: StoredWorkspaceState) => T
): Promise<T> {
  return withLock(ws.id, async lease => {
    const loaded = await load(ws)
    const draft = structuredClone(loaded.state)
    const result = change(draft)
    if (result instanceof Promise)
      throw new TypeError('Workspace state changes must be synchronous')
    draft.workspacePath = ws.path
    draft.revision = loaded.state.revision
    compactWorkspaceState(draft)
    if (JSON.stringify(draft) === JSON.stringify(loaded.state)) return result
    if (!loaded.writable) throw new WorkspaceStateVersionError(statePath(ws.id))
    draft.revision++
    await writeStateFile(statePath(ws.id), draft, lease)
    loaded.state = draft
    publishEvent({ type: 'state:changed', workspaceId: ws.id, state: toWorkspaceState(draft) })
    return result
  })
}

export function hasWorkspaceState(workspaceId: string): boolean {
  return existsSync(statePath(workspaceId))
}

async function listStateIds(): Promise<string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true })
    return entries.filter(entry => entry.isDirectory()).map(entry => entry.name)
  } catch {
    return []
  }
}

// Read-only on purpose: the CLI calls this while registering a workspace, and
// only the server may change state files.
async function peekWorkspacePath(workspaceId: string): Promise<string | undefined> {
  try {
    const parsed: unknown = JSON.parse(await Bun.file(statePath(workspaceId)).text())
    if (typeof parsed !== 'object' || parsed === null) return undefined
    const { workspacePath } = parsed as { workspacePath?: unknown }
    return typeof workspacePath === 'string' ? workspacePath : undefined
  } catch {
    return undefined
  }
}

// The id a removed workspace had, so re-adding the same folder brings back its
// chats, pin and settings.
export async function findStateIdForPath(workspacePath: string): Promise<string | undefined> {
  for (const id of await listStateIds()) {
    if ((await peekWorkspacePath(id)) === workspacePath) return id
  }
  return undefined
}

// Startup housekeeping: drop temp files a killed process left behind, and the
// state of removed workspaces whose folders no longer exist. A removed
// workspace whose folder still exists keeps its state for re-adding.
export async function prepareWorkspaceStates(registered: readonly WorkspaceRef[]): Promise<void> {
  const registeredIds = new Set(registered.map(ws => ws.id))
  for (const id of await listStateIds()) {
    const dir = join(root, id)
    if (!registeredIds.has(id)) {
      const workspacePath = await peekWorkspacePath(id)
      if (workspacePath && !existsSync(workspacePath)) {
        await rm(dir, { recursive: true, force: true })
        continue
      }
    }
    const files = await readdir(dir).catch(() => [])
    for (const file of files) {
      if (file.startsWith(`${STATE_FILE}.`) && file.endsWith('.tmp'))
        await rm(join(dir, file), { force: true })
    }
  }
}
