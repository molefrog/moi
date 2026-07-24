import type { WorkspaceSkillsStatus, WorkspaceSkillStatus, WorkspaceType } from '@/lib/types'

import { isMinorBehind, skillStatuses } from './skill-version'
import { installBundledSkills } from './skills-template'
import { skillsDirFor } from './workspace-init'

export type WorkspaceSkillUpdateResult = {
  before: WorkspaceSkillStatus[]
  status: WorkspaceSkillsStatus
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
  const skills = await skillStatuses(workspaceRoot, type)

  return {
    before,
    status: summarizeSkillStatuses(skills)
  }
}
