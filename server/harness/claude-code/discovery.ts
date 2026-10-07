// Workspace discovery needs only cwd metadata. SDK listSessions({}) builds
// summaries across the entire history and can overwhelm a long-lived install.
import { opendir, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'

import type { DiscoveredWorkspaceCandidate } from '../types'
import { isLinkedGitWorktree } from './git-worktree'

const HEAD_BYTES = 64 * 1024
const FILES_PER_PROJECT = 3
const ENTRIES_PER_PROJECT = 128
const PROJECT_ENTRIES = 2048
const SCAN_MS = 2000
const CACHE_MS = 30_000

// Stream entries so even a directory with thousands of sessions has bounded
// enumeration cost. Do not follow symlinks or recurse into subagent histories.
async function* entries(dir: string, limit: number, deadline: number) {
  try {
    const handle = await opendir(dir)
    let count = 0
    for await (const entry of handle) {
      if (performance.now() >= deadline) break
      yield entry
      if (++count >= limit) break
    }
  } catch {
    // Missing or unreadable history must not prevent other projects loading.
  }
}

async function projectCwd(project: string, deadline: number): Promise<string | undefined> {
  let files = 0
  for await (const entry of entries(project, ENTRIES_PER_PROJECT, deadline)) {
    if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue
    try {
      const head = await Bun.file(join(project, entry.name)).slice(0, HEAD_BYTES).text()
      for (const line of head.split('\n')) {
        if (!line.trimStart().startsWith('{')) continue
        try {
          const record: unknown = JSON.parse(line)
          if (
            record &&
            typeof record === 'object' &&
            'cwd' in record &&
            typeof record.cwd === 'string' &&
            isAbsolute(record.cwd)
          ) {
            return resolve(record.cwd)
          }
        } catch {
          // Skip malformed/truncated records; never fish cwd out of message text.
        }
      }
    } catch {}
    if (++files >= FILES_PER_PROJECT) break
  }
}

async function scanProjects(root: string): Promise<string[]> {
  const deadline = performance.now() + SCAN_MS
  const paths = new Set<string>()
  for await (const entry of entries(root, PROJECT_ENTRIES, deadline)) {
    if (!entry.isDirectory()) continue
    const cwd = await projectCwd(join(root, entry.name), deadline)
    if (!cwd || paths.has(cwd) || performance.now() >= deadline) continue
    try {
      if ((await stat(cwd)).isDirectory() && !(await isLinkedGitWorktree(cwd))) paths.add(cwd)
    } catch {}
  }
  return [...paths]
}

// One cache slot avoids retaining old roots if CLAUDE_CONFIG_DIR changes.
// Infinity shares an in-flight scan; the TTL starts when the scan completes.
let cache: { root: string; expiresAt: number; result: Promise<string[]> } | undefined

export async function discoverClaudeWorkspaces(
  registeredPaths: Set<string>,
  projectsRoot = join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), 'projects')
): Promise<DiscoveredWorkspaceCandidate[]> {
  const root = resolve(projectsRoot)
  if (!cache || cache.root !== root || Date.now() >= cache.expiresAt) {
    const next = { root, expiresAt: Infinity, result: scanProjects(root).catch(() => []) }
    cache = next
    void next.result.finally(() => {
      next.expiresAt = Date.now() + CACHE_MS
    })
  }
  const registered = new Set([...registeredPaths].map(path => resolve(path)))
  return (await cache.result)
    .filter(path => !registered.has(path))
    .map(path => ({ path, type: 'claude-code' }))
}
