// The one place that knows how to turn a directory into a moi workspace:
// bundled skills + the `.moi/` scaffold, with the skills location keyed on the
// agent backend. `moi init`, `moi openclaw init`, and the HTTP API (UI import /
// create) all provision through here, so a workspace set up from the UI is
// indistinguishable from one set up via the CLI.
import { mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

import type { WorkspaceType } from '@/lib/types'

import { scaffoldMoiDir } from './moi-scaffold'
import { installBundledSkills } from './skills-template'

// Where each backend loads skills from. Claude Code reads `.claude/skills/`;
// OpenClaw resolves `<workspace>/skills/` with the highest precedence (it wins
// over same-named bundled or per-user skills). An untyped entry is Claude Code.
export function skillsDirFor(workspaceRoot: string, type?: WorkspaceType): string {
  return type === 'openclaw'
    ? join(workspaceRoot, 'skills')
    : join(workspaceRoot, '.claude', 'skills')
}

// Folder that holds workspaces created from the UI (`/workspace/create`) — a
// visible home-dir folder, mirroring how Cowork keeps its session folders under
// the user's home rather than an app-data dir.
export const CREATED_WORKSPACES_ROOT = join(homedir(), 'moi')

export type ProvisionResult = {
  // Where the skills were installed (backend-dependent, see skillsDirFor).
  skillsDir: string
  // 'exists' when `.moi/` was already bootstrapped, else the bun install exit
  // code (non-zero means deps must be installed manually — not fatal).
  scaffold: 'exists' | number
}

// Lay down everything a workspace needs: create the folder, copy the bundled
// skills into the backend's skills dir, and bootstrap `.moi/`. Idempotent —
// re-running refreshes skills and leaves an existing `.moi/` untouched.
// Registration in the workspace registry is a separate, caller-owned step.
export async function provisionWorkspace(
  workspaceRoot: string,
  type?: WorkspaceType
): Promise<ProvisionResult> {
  const skillsDir = skillsDirFor(workspaceRoot, type)
  await mkdir(workspaceRoot, { recursive: true })
  await installBundledSkills(skillsDir)
  const scaffold = await scaffoldMoiDir(workspaceRoot)
  return { skillsDir, scaffold }
}

// Validate a folder name typed in the create-workspace form. Returns a
// user-facing error, or null when the name is usable as a single path segment
// under CREATED_WORKSPACES_ROOT. Leading dots are rejected so a name can never
// be hidden or collide with `.moi` / `.claude`.
export function validateWorkspaceFolderName(name: string): string | null {
  if (!name) return 'Folder name is required'
  if (name.length > 64) return 'Folder name is too long (max 64 characters)'
  if (!/^[A-Za-z0-9][A-Za-z0-9._ -]*$/.test(name)) {
    return 'Use letters, numbers, dots, dashes, underscores and spaces, starting with a letter or number'
  }
  if (name.endsWith('.') || name.endsWith(' ')) {
    return 'Folder name cannot end with a dot or space'
  }
  return null
}
