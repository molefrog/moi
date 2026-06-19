import { join } from 'path'

import type { ThreadConfig } from '@/lib/types'

// Per-thread model/effort overrides, stored next to the workspace layout so a
// thread reopens with the same settings it last ran with. One file per session:
// `<workspace>/.moi/threads/<sessionId>.json`. Provider-agnostic — both Claude
// Code and OpenClaw threads use the same store.

// A patch may clear a field with `null` (vs `undefined`, which leaves it alone).
export type ThreadConfigPatch = {
  model?: string | null
  effort?: string | null
}

// sessionIds are UUIDs, but they arrive from the URL — reject anything with path
// separators or traversal so a crafted id can't escape the threads directory.
function isValidSessionId(sessionId: string): boolean {
  return /^[A-Za-z0-9._-]+$/.test(sessionId) && sessionId !== '.' && sessionId !== '..'
}

function threadConfigPath(workspacePath: string, sessionId: string): string {
  return join(workspacePath, '.moi', 'threads', `${sessionId}.json`)
}

export async function getThreadConfig(
  workspacePath: string,
  sessionId: string
): Promise<ThreadConfig> {
  if (!isValidSessionId(sessionId)) return {}
  try {
    const parsed = JSON.parse(await Bun.file(threadConfigPath(workspacePath, sessionId)).text())
    const out: ThreadConfig = {}
    if (typeof parsed?.model === 'string') out.model = parsed.model
    if (typeof parsed?.effort === 'string') out.effort = parsed.effort
    return out
  } catch {
    return {}
  }
}

// Whether a thread already has a stored config (any field set).
export async function hasThreadConfig(workspacePath: string, sessionId: string): Promise<boolean> {
  const cfg = await getThreadConfig(workspacePath, sessionId)
  return cfg.model !== undefined || cfg.effort !== undefined
}

// Move a thread's config file from one id to another (temp id → SDK real id on
// rename). Merges onto whatever the destination already holds (destination wins,
// so a concurrent write under the real id isn't lost) and removes the source.
export async function renameThreadConfig(
  workspacePath: string,
  from: string,
  to: string
): Promise<void> {
  if (from === to) return
  const src = await getThreadConfig(workspacePath, from)
  if (src.model === undefined && src.effort === undefined) return
  if (!isValidSessionId(from) || !isValidSessionId(to)) return
  const dst = await getThreadConfig(workspacePath, to)
  await Bun.write(threadConfigPath(workspacePath, to), JSON.stringify({ ...src, ...dst }, null, 2))
  try {
    await Bun.file(threadConfigPath(workspacePath, from)).delete()
  } catch {}
}

// Merge a patch over the stored config and write it back. `null` clears a field,
// `undefined` leaves it untouched, a string sets it. Returns the merged config.
export async function saveThreadConfig(
  workspacePath: string,
  sessionId: string,
  patch: ThreadConfigPatch
): Promise<ThreadConfig> {
  if (!isValidSessionId(sessionId)) return {}
  const next = await getThreadConfig(workspacePath, sessionId)
  for (const key of ['model', 'effort'] as const) {
    const value = patch[key]
    if (value === undefined) continue
    if (value === null) delete next[key]
    else next[key] = value
  }
  await Bun.write(threadConfigPath(workspacePath, sessionId), JSON.stringify(next, null, 2))
  return next
}
