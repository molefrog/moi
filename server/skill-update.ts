import type { WorkspaceSkillsStatus, WorkspaceSkillStatus, WorkspaceType } from '@/lib/types'

import { writeAppletEnvDts } from './moi-scaffold'
import { isMinorBehind, skillStatuses } from './skill-version'
import { installBundledSkills } from './skills-template'
import { skillsDirFor } from './workspace-init'

export type WorkspaceSkillUpdateResult = {
  before: WorkspaceSkillStatus[]
  status: WorkspaceSkillsStatus
  // False when the workspace has no `.moi/` to refresh — nothing was written.
  appletTypesWritten: boolean
}

export function summarizeSkillStatuses(skills: WorkspaceSkillStatus[]): WorkspaceSkillsStatus {
  return {
    skills,
    updateAvailable: skills.some(skill => isMinorBehind(skill.installed, skill.bundled))
  }
}

export async function getWorkspaceSkillsStatus(
  workspaceRoot: string,
  type?: WorkspaceType
): Promise<WorkspaceSkillsStatus> {
  return summarizeSkillStatuses(await skillStatuses(workspaceRoot, type))
}

export async function updateWorkspaceSkills(
  workspaceRoot: string,
  type: WorkspaceType = 'claude-code'
): Promise<WorkspaceSkillUpdateResult> {
  const before = await skillStatuses(workspaceRoot, type)
  await installBundledSkills(skillsDirFor(workspaceRoot, type))
  // The ambient applet types ship with the CLI just like the skills do, and go
  // stale the same way — refresh both in one operation so `moi skill update`
  // (and the UI's update button) leaves nothing behind. Skipped when the
  // workspace has no `.moi/`: skills stand on their own, applet types don't.
  const appletTypesWritten = await writeAppletEnvDts(workspaceRoot)
  const skills = await skillStatuses(workspaceRoot, type)

  return {
    before,
    status: summarizeSkillStatuses(skills),
    appletTypesWritten
  }
}
