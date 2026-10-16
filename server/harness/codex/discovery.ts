// Discover workspace paths from rollout metadata under $CODEX_HOME/sessions
// (default ~/.codex/sessions), even when the CLI is no longer installed.
import { stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'

import type { DiscoveredWorkspaceCandidate } from '../types'
import { DISCOVERY_HEAD_BYTES, DISCOVERY_SCAN_MS, discoveryEntries } from '../discovery'

export const CODEX_SESSIONS_ROOT = join(
  process.env.CODEX_HOME || join(homedir(), '.codex'),
  'sessions'
)

// Bound discovery cost; workspaces present only in older rollouts may be missed.
const SCAN_LIMIT = 400
const DIRECTORY_ENTRIES = 2048

// Parse the first line of a rollout file. Formats differ across CLI versions
// ({type:'session_meta', payload:{cwd}} vs a flat meta object), so accept both
// and fall back to a regex when the head truncates mid-JSON.
async function readSessionCwd(file: string): Promise<string | undefined> {
  let head: string
  try {
    head = await Bun.file(file).slice(0, DISCOVERY_HEAD_BYTES).text()
  } catch {
    return undefined
  }
  const nl = head.indexOf('\n')
  const line = nl >= 0 ? head.slice(0, nl) : head
  try {
    const parsed = JSON.parse(line) as {
      cwd?: string
      payload?: { cwd?: string }
    }
    const cwd = parsed.payload?.cwd ?? parsed.cwd
    // isAbsolute (not a '/' check) so Windows drive-letter cwds survive.
    if (typeof cwd === 'string' && isAbsolute(cwd)) return cwd
  } catch {
    // Truncated head: pull the quoted cwd value out and JSON-parse just the
    // string so escapes (Windows "C:\\...") decode correctly.
    const m = line.match(/"cwd"\s*:\s*("(?:[^"\\]|\\.)*")/)
    if (m) {
      try {
        const cwd = JSON.parse(m[1]) as string
        if (isAbsolute(cwd)) return cwd
      } catch {}
    }
  }
  return undefined
}

// Prefer newer date partitions within the bounded sample. Histories exceeding
// the entry/file/time limits may omit workspaces; explicit import still works.
async function listRolloutFiles(root: string, deadline: number): Promise<string[]> {
  const out: string[] = []
  async function walk(dir: string, depth = 0) {
    if (depth > 3 || out.length >= SCAN_LIMIT || performance.now() >= deadline) return
    const entries = []
    for await (const entry of discoveryEntries(dir, DIRECTORY_ENTRIES, deadline)) {
      entries.push(entry)
    }
    entries.sort((a, b) => (a.name < b.name ? 1 : -1))
    for (const e of entries) {
      if (out.length >= SCAN_LIMIT || performance.now() >= deadline) return
      const p = join(dir, e.name)
      if (e.isDirectory()) await walk(p, depth + 1)
      else if (e.isFile() && e.name.endsWith('.jsonl')) out.push(p)
    }
  }
  await walk(root)
  return out
}

export async function discoverCodexWorkspaces(
  registeredPaths: Set<string>,
  sessionsRoot: string = CODEX_SESSIONS_ROOT
): Promise<DiscoveredWorkspaceCandidate[]> {
  const deadline = performance.now() + DISCOVERY_SCAN_MS
  const files = await listRolloutFiles(sessionsRoot, deadline)
  const paths = new Set<string>()
  for (const file of files) {
    if (performance.now() >= deadline) break
    const cwd = await readSessionCwd(file)
    if (cwd) paths.add(cwd)
  }
  const out: DiscoveredWorkspaceCandidate[] = []
  for (const cwd of paths) {
    if (performance.now() >= deadline) break
    if (registeredPaths.has(cwd)) continue
    try {
      if (!(await stat(cwd)).isDirectory()) continue
    } catch {
      continue // directory deleted since the session ran
    }
    out.push({ path: cwd, type: 'codex' })
  }
  return out
}
