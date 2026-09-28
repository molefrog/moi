import type { WorkspaceSkillsStatus, WorkspaceSkillStatus, WorkspaceType } from '@/lib/types'

import type { AppletDeclarationFile } from './applets/declarations'
import { syncAppletDeclarations } from './applets/declarations'
import { isBehind, skillStatuses } from './skill-version'
import { installBundledSkills } from './skills-template'
import { skillsDirFor } from './workspace-init'

export type WorkspaceSkillUpdateResult = {
  before: WorkspaceSkillStatus[]
  status: WorkspaceSkillsStatus
  changedSkills: string[]
  updatedAppletTypes: AppletDeclarationFile[]
}

export function summarizeSkillStatuses(skills: WorkspaceSkillStatus[]): WorkspaceSkillsStatus {
  return {
    skills,
    updateAvailable: skills.some(skill => isBehind(skill.installed, skill.bundled))
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
  const changedSkills = await installBundledSkills(skillsDirFor(workspaceRoot, type))
  // Applet declarations ship with the CLI, so refresh installed copies along
  // with skills. The optional collab declaration is only updated if present.
  const updatedAppletTypes = await syncAppletDeclarations(workspaceRoot)
  const skills = await skillStatuses(workspaceRoot, type)

  return {
    before,
    status: summarizeSkillStatuses(skills),
    changedSkills,
    updatedAppletTypes
  }
}
