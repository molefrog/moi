// Archived-chat bookkeeping for ACP backends.
//
// ACP specifies `session/delete`, but agents do not implement it — Hermes 0.20
// answers it with JSON-RPC -32601 "Method not found", and its per-session
// archive flag is reachable only through the `hermes serve` HTTP routes, a
// daemon moi deliberately does not run. So moi hides archived chats on its own
// side, exactly like the Claude Code harness (which tags a session
// `moi:archived` and filters the list rather than deleting anything).
//
// Nothing is destroyed: the chat stays in the backend's own store and remains
// visible to that agent's CLI, which is the correct boundary — moi hides a chat
// from moi, not from the user's agent.
//
// Stored OUTSIDE the workspace (no repo churn) in ONE global JSON file in moi's
// data dir, keyed by workspace path then session id:
//   { "<workspacePath>": ["<sessionId>", …] }
// Path (not registry id) is the key so the list survives re-registration, the
// same choice session-config.ts makes.
import { mkdir, rename } from 'node:fs/promises'
import { join } from 'node:path'

import { DATA_DIR } from '../../data-dir'

type Store = Record<string, string[]>

export const DEFAULT_ARCHIVED_SESSIONS_PATH = join(DATA_DIR, 'acp-archived-sessions.json')

let storePath = DEFAULT_ARCHIVED_SESSIONS_PATH

// Test seam: point the store at a scratch file (mirrors setSessionConfigPath).
export function setArchivedSessionsPath(path: string): void {
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

// Serialize read-modify-write so concurrent archive calls can't clobber the
// single shared file (last writer would otherwise drop the other's update).
let writeChain: Promise<unknown> = Promise.resolve()
function locked<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeChain.then(fn, fn)
  writeChain = run.catch(() => {})
  return run
}

export async function archivedAcpSessions(workspacePath: string): Promise<Set<string>> {
  return locked(async () => new Set((await readStore())[workspacePath] ?? []))
}

export async function archiveAcpSession(workspacePath: string, sessionId: string): Promise<void> {
  if (!sessionId) return
  await locked(async () => {
    const store = await readStore()
    const ids = store[workspacePath] ?? []
    if (ids.includes(sessionId)) return
    store[workspacePath] = [...ids, sessionId]
    await writeStore(store)
  })
}

// Not wired to a route yet — chats are archived, never unarchived, in the UI.
// Kept because the store is only a hide, so undoing it is a one-liner and the
// asymmetry would otherwise look like data loss.
export async function unarchiveAcpSession(workspacePath: string, sessionId: string): Promise<void> {
  await locked(async () => {
    const store = await readStore()
    const ids = store[workspacePath]
    if (!ids?.includes(sessionId)) return
    const next = ids.filter(id => id !== sessionId)
    if (next.length) store[workspacePath] = next
    else delete store[workspacePath]
    await writeStore(store)
  })
}
