import { mkdir, rename } from 'node:fs/promises'
import { join } from 'path'

import envPaths from 'env-paths'

import type { ThreadConfig } from '@/lib/types'

// Per-thread model/effort overrides for chat threads. Stored OUTSIDE the user's
// workspace (no repo churn) in ONE global JSON file in moi's data dir, alongside
// the workspace registry. Keyed by workspace path then sessionId:
//   { "<workspacePath>": { "<sessionId>": { model?, effort? } } }
// Path (not registry id) is the key so config survives re-registration and lines
// up with the SDK's path-based session storage.

// A patch may clear a field with `null` (vs `undefined`, which leaves it alone).
export type ThreadConfigPatch = {
  model?: string | null
  effort?: string | null
}

type Store = Record<string, Record<string, ThreadConfig>>

const DATA_DIR = envPaths('moi', { suffix: false }).data
let _path = join(DATA_DIR, 'thread-config.json')

// Test seam: point the store at a scratch file (mirrors registry.setRegistryPath).
export function setThreadConfigPath(path: string): void {
  _path = path
}

function clean(cfg: ThreadConfig | undefined): ThreadConfig {
  const out: ThreadConfig = {}
  if (typeof cfg?.model === 'string') out.model = cfg.model
  if (typeof cfg?.effort === 'string') out.effort = cfg.effort
  return out
}

async function readStore(): Promise<Store> {
  try {
    const parsed = JSON.parse(await Bun.file(_path).text())
    return parsed && typeof parsed === 'object' ? (parsed as Store) : {}
  } catch {
    return {}
  }
}

async function writeStore(store: Store): Promise<void> {
  await mkdir(join(_path, '..'), { recursive: true })
  const tmp = `${_path}.${process.pid}.tmp`
  await Bun.write(tmp, JSON.stringify(store, null, 2))
  await rename(tmp, _path)
}

// Serialize read-modify-write so concurrent save/rename calls can't clobber the
// single shared file (last writer would otherwise drop the other's update).
let writeChain: Promise<unknown> = Promise.resolve()
function locked<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeChain.then(fn, fn)
  writeChain = run.catch(() => {})
  return run
}

export async function getThreadConfig(
  workspacePath: string,
  sessionId: string
): Promise<ThreadConfig> {
  const store = await readStore()
  return clean(store[workspacePath]?.[sessionId])
}

export async function hasThreadConfig(workspacePath: string, sessionId: string): Promise<boolean> {
  const cfg = await getThreadConfig(workspacePath, sessionId)
  return cfg.model !== undefined || cfg.effort !== undefined
}

// Merge a patch over the stored config and write it back. `null` clears a field,
// `undefined` leaves it untouched, a string sets it. An emptied entry is dropped
// to keep the file tidy. Returns the merged config.
export async function saveThreadConfig(
  workspacePath: string,
  sessionId: string,
  patch: ThreadConfigPatch
): Promise<ThreadConfig> {
  return locked(async () => {
    const store = await readStore()
    const threads = store[workspacePath] ?? {}
    const next = clean(threads[sessionId])
    for (const key of ['model', 'effort'] as const) {
      const value = patch[key]
      if (value === undefined) continue
      if (value === null) delete next[key]
      else next[key] = value
    }
    if (next.model === undefined && next.effort === undefined) delete threads[sessionId]
    else threads[sessionId] = next
    if (Object.keys(threads).length === 0) delete store[workspacePath]
    else store[workspacePath] = threads
    await writeStore(store)
    return next
  })
}

// Move a thread's config from one id to another (temp id → SDK real id on
// rename). Merges onto whatever the destination already holds (destination wins,
// so a concurrent write under the real id isn't lost) and removes the source.
export async function renameThreadConfig(
  workspacePath: string,
  from: string,
  to: string
): Promise<void> {
  if (from === to) return
  await locked(async () => {
    const store = await readStore()
    const threads = store[workspacePath]
    const src = clean(threads?.[from])
    if (src.model === undefined && src.effort === undefined) return
    threads![to] = { ...src, ...clean(threads![to]) }
    delete threads![from]
    store[workspacePath] = threads!
    await writeStore(store)
  })
}
