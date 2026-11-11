import { loadWorkspaceFileConfig } from './layout'
// The one place that knows how to turn a directory into a Moi workspace:
// bundled skills + the `.moi/` scaffold, with the skills location keyed on the
// agent backend. `moi init`, `moi openclaw init`, and the HTTP API (UI import /
// create) all provision through here, so a workspace set up from the UI is
// indistinguishable from one set up via the CLI.
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

import type { WorkspaceType } from '@/lib/types'
import { workspaceIdFromName } from '@/lib/workspace-name'
import { validateWorkspaceId } from '@/lib/ids'
import { getWorkspace } from './registry'

import { harnessFor } from '../harness/registry'
import { createDependencyInstallLogPath, scaffoldMoiDir } from './scaffold'
import { installWorkspaceSkills } from '../skills/workspace'

// Reserve a unique folder whose basename is also its workspace ID.
export async function createWorkspaceDirectory(
  name: string,
  root: string,
  lookup = getWorkspace
): Promise<string> {
  const base = workspaceIdFromName(name)
  await mkdir(root, { recursive: true })
  for (let suffix = 1; ; suffix++) {
    const id = suffix === 1 ? base : `${base}-${suffix}`
    if (validateWorkspaceId(id) || (await lookup(id))) continue
    const path = join(root, id)
    try {
      await mkdir(path)
      return path
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    }
  }
}

// Where each backend loads skills from — the harness owns the answer
// (Claude Code: `.claude/skills/`; OpenClaw: `<workspace>/skills/`; Codex:
// `.agents/skills/` per the Agent Skills standard). An untyped entry is
// Claude Code.
export function skillsDirFor(workspaceRoot: string, type?: WorkspaceType): string {
  return harnessFor(type).skillsDir?.(workspaceRoot) ?? join(workspaceRoot, '.claude', 'skills')
}

export type ProvisionResult = {
  // Where the skills were installed (backend-dependent, see skillsDirFor).
  skillsDir: string
} & (
  | { scaffold: 'skipped' | 'exists'; installLogPath?: never }
  // Dependency installation is running or finished with this exit code.
  | { scaffold: 'installing' | number; installLogPath: string }
)

// Lay down everything a workspace needs: reset Claude/Codex's shared skill
// (or copy skills to other backends' own destinations), and bootstrap `.moi/`.
// Re-running refreshes skills and leaves an existing `.moi/` untouched.
// Registration in the workspace registry is a separate, caller-owned step.
export async function provisionWorkspace(
  workspaceRoot: string,
  type?: WorkspaceType
): Promise<ProvisionResult> {
  const skillsDir = skillsDirFor(workspaceRoot, type)
  await mkdir(workspaceRoot, { recursive: true })
  const config = await loadWorkspaceFileConfig(workspaceRoot)
  await installWorkspaceSkills(workspaceRoot, type)
  if (config.remote) return { skillsDir, scaffold: 'skipped' }
  const installLogPath = createDependencyInstallLogPath()
  const scaffold = await scaffoldMoiDir(workspaceRoot, undefined, undefined, installLogPath)
  if (scaffold === 'exists') return { skillsDir, scaffold }
  return { skillsDir, scaffold, installLogPath }
}
