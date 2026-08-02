import { mkdir, rename, rm } from 'node:fs/promises'
import { join } from 'path'

import type { SessionConfig } from '@/lib/types'

import { DATA_DIR } from './data-dir'

// Per-session model/effort/Fast-mode overrides. Stored OUTSIDE
// the user's workspace (no repo churn) in ONE global JSON file in moi's data
// dir, alongside the workspace registry. Keyed by workspace path then sessionId:
//   { "<workspacePath>": { "<sessionId>": { model?, effort?, fastMode? } } }
// Path (not registry id) is the key so config survives re-registration and lines
// up with the SDK's path-based session storage.

// A patch may clear a field with `null` (vs `undefined`, which leaves it alone).
export type SessionConfigPatch = {
  model?: string | null
  effort?: string | null
  fastMode?: boolean | null
}

type Store = Record<string, Record<string, SessionConfig>>

export const DEFAULT_SESSION_CONFIG_PATH = join(DATA_DIR, 'session-config.json')
export const LEGACY_SESSION_CONFIG_PATH = join(DATA_DIR, 'thread-config.json')

let storePath = DEFAULT_SESSION_CONFIG_PATH
let legacyStorePath = LEGACY_SESSION_CONFIG_PATH

// Test seam: point the store at a scratch file (mirrors registry.setRegistryPath).
export function setSessionConfigPath(path: string, legacyPath?: string): void {
  storePath = path
  legacyStorePath = legacyPath ?? join(path, '..', 'thread-config.json')
}

function clean(cfg: SessionConfig | undefined): SessionConfig {
  const out: SessionConfig = {}
  if (typeof cfg?.model === 'string') out.model = cfg.model
  if (typeof cfg?.effort === 'string') out.effort = cfg.effort
  if (typeof cfg?.fastMode === 'boolean') out.fastMode = cfg.fastMode
  return out
}

function isEmpty(cfg: SessionConfig): boolean {
  return cfg.model === undefined && cfg.effort === undefined && cfg.fastMode === undefined
}

async function readStoreFile(path: string): Promise<Store | null> {
  try {
    const parsed = JSON.parse(await Bun.file(path).text())
    return parsed && typeof parsed === 'object' ? (parsed as Store) : {}
  } catch {
    return null
  }
}

async function writeStore(store: Store): Promise<void> {
  await mkdir(join(storePath, '..'), { recursive: true })
  const tmp = `${storePath}.${process.pid}.tmp`
  await Bun.write(tmp, JSON.stringify(store, null, 2))
  await rename(tmp, storePath)
}

async function readStore(): Promise<Store> {
  const current = await readStoreFile(storePath)
  if (current) return current

  const legacy = await readStoreFile(legacyStorePath)
  if (!legacy) return {}
  await writeStore(legacy)
  await rm(legacyStorePath, { force: true })
  return legacy
}

// Serialize read-modify-write so concurrent save/rename calls can't clobber the
// single shared file (last writer would otherwise drop the other's update).
let writeChain: Promise<unknown> = Promise.resolve()
function locked<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeChain.then(fn, fn)
  writeChain = run.catch(() => {})
  return run
}

export async function getSessionConfig(
  workspacePath: string,
  sessionId: string
): Promise<SessionConfig> {
  return locked(async () => {
    const store = await readStore()
    return clean(store[workspacePath]?.[sessionId])
  })
}

export async function hasSessionConfig(workspacePath: string, sessionId: string): Promise<boolean> {
  return !isEmpty(await getSessionConfig(workspacePath, sessionId))
}

// Merge a patch over the stored config and write it back. `null` clears a field,
// `undefined` leaves it untouched, and a typed value sets it. An emptied entry
// is dropped to keep the file tidy. Returns the merged config.
export async function saveSessionConfig(
  workspacePath: string,
  sessionId: string,
  patch: SessionConfigPatch
): Promise<SessionConfig> {
  return locked(async () => {
    const store = await readStore()
    const sessions = store[workspacePath] ?? {}
    const next = clean(sessions[sessionId])
    for (const key of ['model', 'effort'] as const) {
      const value = patch[key]
      if (value === undefined) continue
      if (value === null) delete next[key]
      else next[key] = value
    }
    if (patch.fastMode === null) delete next.fastMode
    else if (patch.fastMode !== undefined) next.fastMode = patch.fastMode
    if (isEmpty(next)) delete sessions[sessionId]
    else sessions[sessionId] = next
    if (Object.keys(sessions).length === 0) delete store[workspacePath]
    else store[workspacePath] = sessions
    await writeStore(store)
    return next
  })
}

// Move a session's config from one id to another (temp id → SDK real id on
// rename). Merges onto whatever the destination already holds (destination wins,
// so a concurrent write under the real id isn't lost) and removes the source.
export async function renameSessionConfig(
  workspacePath: string,
  from: string,
  to: string
): Promise<void> {
  if (from === to) return
  await locked(async () => {
    const store = await readStore()
    const sessions = store[workspacePath]
    const src = clean(sessions?.[from])
    if (isEmpty(src)) return
    sessions![to] = { ...src, ...clean(sessions![to]) }
    delete sessions![from]
    store[workspacePath] = sessions!
    await writeStore(store)
  })
}
