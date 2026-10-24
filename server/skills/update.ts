import type { WorkspaceSkillsStatus, WorkspaceSkillStatus, WorkspaceType } from '@/lib/types'

import type { AppletDeclarationFile } from '../applets/declarations'
import { syncAppletDeclarations } from '../applets/declarations'
import { isBehind, skillStatuses, skillStatusesForLocations } from './version'
import { installBundledSkill } from './template'
import { resolveSkillLocations } from './locations'

export type WorkspaceSkillUpdateResult = {
  before: WorkspaceSkillStatus[]
  status: WorkspaceSkillsStatus
  changedSkills: string[]
  changedSkillPaths: string[]
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
  const locations = await resolveSkillLocations(workspaceRoot, type)
  const before = await skillStatusesForLocations(locations)
  for (const location of locations) {
    if (location.brokenLink) {
      throw new Error(
        `Cannot update skill at ${location.path}: broken symlink ${location.brokenLink}`
      )
    }
  }
  const changedTargets = new Map<string, boolean>()
  for (const location of locations) {
    if (changedTargets.has(location.targetPath)) continue
    try {
      changedTargets.set(
        location.targetPath,
        await installBundledSkill(location.name, location.targetPath)
      )
    } catch (cause) {
      throw new Error(`Cannot update skill at ${location.path}: ${String(cause)}`, { cause })
    }
  }
  const changedLocations = locations.filter(location => changedTargets.get(location.targetPath))
  const changedSkills = [...new Set(changedLocations.map(location => location.name))]
  // Applet declarations ship with the CLI, so refresh installed copies along
  // with skills. The optional collab declaration is only updated if present.
  const updatedAppletTypes = await syncAppletDeclarations(workspaceRoot)
  const skills = await skillStatuses(workspaceRoot, type)

  return {
    before,
    status: summarizeSkillStatuses(skills),
    changedSkills,
    changedSkillPaths: changedLocations.map(location => location.path),
    updatedAppletTypes
  }
}
