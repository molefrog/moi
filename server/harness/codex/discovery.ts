// Discover directories the Codex CLI has run in, for the home page's
// "Import from this computer" list.
//
// Codex persists every thread as a rollout file under
// `~/.codex/sessions/YYYY/MM/DD/rollout-<timestamp>-<uuid>.jsonl`, whose FIRST
// line is a `session_meta` record carrying the thread's `cwd`. Reading those
// heads directly (no app-server spawn, no codex binary needed) mirrors how the
// Claude Code harness scans its own session history — discovery still works
// when the CLI has since been uninstalled.
import { readdir, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

import type { DiscoveredWorkspace } from '@/lib/types'

export const CODEX_SESSIONS_ROOT = join(homedir(), '.codex', 'sessions')

// Newest files scanned per discovery pass. Session dirs grow unboundedly; the
// most recent rollouts cover every workspace anyone still cares about.
const SCAN_LIMIT = 400
// The session_meta line is small (id/cwd/timestamps), but read a generous head
// in case a Codex version inlines instructions into it.
const HEAD_BYTES = 64 * 1024

type SessionMeta = { cwd: string; timestamp?: string }

// Parse the first line of a rollout file. Formats differ across CLI versions
// ({type:'session_meta', payload:{cwd}} vs a flat meta object), so accept both
// and fall back to a regex when the head truncates mid-JSON.
async function readSessionMeta(file: string): Promise<SessionMeta | null> {
  let head: string
  try {
    head = await Bun.file(file).slice(0, HEAD_BYTES).text()
  } catch {
    return null
  }
  const nl = head.indexOf('\n')
  const line = nl >= 0 ? head.slice(0, nl) : head
  try {
    const parsed = JSON.parse(line) as {
      timestamp?: string
      cwd?: string
      payload?: { cwd?: string; timestamp?: string }
    }
    const cwd = parsed.payload?.cwd ?? parsed.cwd
    if (typeof cwd === 'string' && cwd.startsWith('/')) {
      const timestamp = parsed.payload?.timestamp ?? parsed.timestamp
      return { cwd, ...(typeof timestamp === 'string' ? { timestamp } : {}) }
    }
  } catch {
    const m = line.match(/"cwd"\s*:\s*"(\/[^"]*)"/)
    if (m) return { cwd: m[1] }
  }
  return null
}

// All rollout files under the date-partitioned tree, newest first. Directory
// names are zero-padded dates and filenames embed ISO timestamps, so a
// lexicographic sort of full paths IS reverse-chronological order.
async function listRolloutFiles(root: string): Promise<string[]> {
  const out: string[] = []
  async function walk(dir: string) {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const p = join(dir, e.name)
      if (e.isDirectory()) await walk(p)
      else if (e.isFile() && e.name.endsWith('.jsonl')) out.push(p)
    }
  }
  await walk(root)
  return out.sort((a, b) => (a < b ? 1 : -1))
}

export async function discoverCodexWorkspaces(
  registeredPaths: Set<string>,
  sessionsRoot: string = CODEX_SESSIONS_ROOT
): Promise<DiscoveredWorkspace[]> {
  const files = (await listRolloutFiles(sessionsRoot)).slice(0, SCAN_LIMIT)
  // Newest-first scan: the first rollout seen per cwd carries its lastRunAt.
  const byCwd = new Map<string, string | undefined>()
  for (const file of files) {
    const meta = await readSessionMeta(file)
    if (!meta || byCwd.has(meta.cwd)) continue
    byCwd.set(meta.cwd, meta.timestamp)
  }
  const out: DiscoveredWorkspace[] = []
  for (const [cwd, lastRunAt] of byCwd) {
    if (registeredPaths.has(cwd)) continue
    try {
      if (!(await stat(cwd)).isDirectory()) continue
    } catch {
      continue // directory deleted since the session ran
    }
    out.push({ path: cwd, type: 'codex', ...(lastRunAt ? { lastRunAt } : {}) })
  }
  return out
}
