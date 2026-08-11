// Per-run durations for ACP sessions. ACP replays carry no timestamps, so a
// reloaded chat cannot compute how long each agent run took — but moi owns the
// prompt lifecycle live (`session/prompt`'s promise IS the run), so it records
// the durations itself and re-attaches them on replay. Without a recording the
// label falls back to a plain "Worked".
//
// Stored OUTSIDE the workspace in ONE global JSON file in moi's data dir
// (same choice, shape and locking as ./archived.ts), keyed by workspace path
// then session id, one entry per prompt run in prompt order:
//   { "<workspacePath>": { "<sessionId>": [12100, 3400, …] } }
import { mkdir, rename } from 'node:fs/promises'
import { join } from 'node:path'

import { DATA_DIR } from '../../data-dir'

type Store = Record<string, Record<string, number[]>>

export const DEFAULT_RUN_DURATIONS_PATH = join(DATA_DIR, 'acp-run-durations.json')

let storePath = DEFAULT_RUN_DURATIONS_PATH

// Test seam: point the store at a scratch file (mirrors setArchivedSessionsPath).
export function setRunDurationsPath(path: string): void {
  storePath = path
}

async function readStore(): Promise<Store> {
  try {
    const parsed = JSON.parse(await Bun.file(storePath).text())
    return parsed && typeof parsed === 'object' ? (parsed as Store) : {}
  } catch {
    return {}
  }
}

async function writeStore(store: Store): Promise<void> {
  await mkdir(join(storePath, '..'), { recursive: true })
  const tmp = `${storePath}.${process.pid}.tmp`
  await Bun.write(tmp, JSON.stringify(store, null, 2))
  await rename(tmp, storePath)
}

// Serialize read-modify-write so concurrent run completions can't clobber the
// single shared file.
let writeChain: Promise<unknown> = Promise.resolve()
function locked<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeChain.then(fn, fn)
  writeChain = run.catch(() => {})
  return run
}

export async function appendRunDuration(
  workspacePath: string,
  sessionId: string,
  durationMs: number
): Promise<void> {
  if (!sessionId || !Number.isFinite(durationMs) || durationMs < 0) return
  await locked(async () => {
    const store = await readStore()
    const sessions = (store[workspacePath] ??= {})
    sessions[sessionId] = [...(sessions[sessionId] ?? []), Math.round(durationMs)]
    await writeStore(store)
  })
}

export async function runDurations(workspacePath: string, sessionId: string): Promise<number[]> {
  return locked(async () => (await readStore())[workspacePath]?.[sessionId] ?? [])
}
