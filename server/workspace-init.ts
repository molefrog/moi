// The one place that knows how to turn a directory into a moi workspace:
// bundled skills + the `.moi/` scaffold, with the skills location keyed on the
// agent backend. `moi init`, `moi openclaw init`, and the HTTP API (UI import /
// create) all provision through here, so a workspace set up from the UI is
// indistinguishable from one set up via the CLI.
import { mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

import type { WorkspaceType } from '@/lib/types'
export { validateWorkspaceFolderName } from '@/lib/workspace-name'

import { installOfficialShadcnSkill, type ShadcnSkillInstallResult } from './external-skills'
import { harnessFor } from './harness/registry'
import { scaffoldMoiDir } from './moi-scaffold'
import { installBundledSkills } from './skills-template'

// Where each backend loads skills from — the harness owns the answer
// (Claude Code: `.claude/skills/`; OpenClaw: `<workspace>/skills/`; Codex:
// `.agents/skills/` per the Agent Skills standard). An untyped entry is
// Claude Code.
export function skillsDirFor(workspaceRoot: string, type?: WorkspaceType): string {
  return harnessFor(type).skillsDir?.(workspaceRoot) ?? join(workspaceRoot, '.claude', 'skills')
}

// Folder that holds workspaces created from the UI (`/workspace/create`) — a
// visible home-dir folder, mirroring how Cowork keeps its session folders under
// the user's home rather than an app-data dir.
export const CREATED_WORKSPACES_ROOT = join(homedir(), 'moi')

export type ProvisionResult = {
  // Where the skills were installed (backend-dependent, see skillsDirFor).
  skillsDir: string
  // 'exists' when `.moi/` was already bootstrapped, 'installing' when bun
  // install continues in the background, else the install exit code (non-zero
  // means deps are missing — not fatal, the agent installs on demand).
  scaffold: 'exists' | 'installing' | number
}

type InstallShadcnSkill = (
  workspaceRoot: string,
  type: WorkspaceType
) => Promise<ShadcnSkillInstallResult>

async function installShadcnBestEffort(
  workspaceRoot: string,
  type: WorkspaceType,
  installShadcn: InstallShadcnSkill
): Promise<void> {
  try {
    const result = await installShadcn(workspaceRoot, type)
    if (!result.ok) {
      console.warn(`[skills] official shadcn skill install failed: ${result.reason}`)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`[skills] official shadcn skill install failed: ${message}`)
  }
}

// Lay down everything a workspace needs: create the folder, copy moi's bundled
// skill, fetch the current official shadcn skill, and bootstrap `.moi/`.
// Idempotent — re-running refreshes skills and leaves an existing `.moi/`
// untouched. The external skill is best-effort so offline init still works.
// Registration in the workspace registry is a separate, caller-owned step.
export async function provisionWorkspace(
  workspaceRoot: string,
  type: WorkspaceType = 'claude-code',
  installShadcn: InstallShadcnSkill = installOfficialShadcnSkill
): Promise<ProvisionResult> {
  const skillsDir = skillsDirFor(workspaceRoot, type)
  await mkdir(workspaceRoot, { recursive: true })
  await installBundledSkills(skillsDir)
  const [scaffold] = await Promise.all([
    scaffoldMoiDir(workspaceRoot),
    installShadcnBestEffort(workspaceRoot, type, installShadcn)
  ])
  return { skillsDir, scaffold }
}
