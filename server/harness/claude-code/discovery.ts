// Workspace discovery needs only cwd metadata. SDK listSessions({}) builds
// summaries across the entire history and can overwhelm a long-lived install.
import { stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'

import type { DiscoveredWorkspaceCandidate } from '../types'
import { DISCOVERY_HEAD_BYTES, DISCOVERY_SCAN_MS, discoveryEntries } from '../discovery'
import { isLinkedGitWorktree } from './git-worktree'

const FILES_PER_PROJECT = 3
const ENTRIES_PER_PROJECT = 128
const PROJECT_ENTRIES = 2048

async function projectCwd(project: string, deadline: number): Promise<string | undefined> {
  let files = 0
  for await (const entry of discoveryEntries(project, ENTRIES_PER_PROJECT, deadline)) {
    if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue
    try {
      const head = await Bun.file(join(project, entry.name)).slice(0, DISCOVERY_HEAD_BYTES).text()
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
  const deadline = performance.now() + DISCOVERY_SCAN_MS
  const paths = new Set<string>()
  for await (const entry of discoveryEntries(root, PROJECT_ENTRIES, deadline)) {
    if (!entry.isDirectory()) continue
    const cwd = await projectCwd(join(root, entry.name), deadline)
    if (!cwd || paths.has(cwd) || performance.now() >= deadline) continue
    try {
      if ((await stat(cwd)).isDirectory() && !(await isLinkedGitWorktree(cwd))) paths.add(cwd)
    } catch {}
  }
  return [...paths]
}

export async function discoverClaudeWorkspaces(
  registeredPaths: Set<string>,
  projectsRoot = join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), 'projects')
): Promise<DiscoveredWorkspaceCandidate[]> {
  const registered = new Set([...registeredPaths].map(path => resolve(path)))
  return (await scanProjects(resolve(projectsRoot)))
    .filter(path => !registered.has(path))
    .map(path => ({ path, type: 'claude-code' }))
}
