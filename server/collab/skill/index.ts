import { mkdir, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import type { WorkspaceType } from '@/lib/types'

import { appletDeclarationPath, installCollabDeclaration } from '../../applets/declarations'
import { COLLAB_REFERENCE_SOURCE_PATH } from '../../skills-template'
import { skillsDirFor } from '../../workspace-init'

export type SkillPaths = { referencePath: string; typesPath: string }

export function collabSkillReferencePath(workspacePath: string, type?: WorkspaceType): string {
  return join(skillsDirFor(workspacePath, type), 'moi-workspace', 'references', 'COLLAB.md')
}

function targetPaths(workspacePath: string, type?: WorkspaceType): SkillPaths {
  return {
    referencePath: collabSkillReferencePath(workspacePath, type),
    typesPath: appletDeclarationPath(workspacePath, 'collab.d.ts')
  }
}

async function writeChanged(path: string, contents: string): Promise<void> {
  const file = Bun.file(path)
  if ((await file.exists()) && (await file.text()) === contents) return
  await mkdir(dirname(path), { recursive: true })
  await Bun.write(path, contents)
}

// Only an explicit `moi init --experimental-collab` installs the guide and types.
export async function installCollabSkill(
  workspacePath: string,
  type?: WorkspaceType
): Promise<SkillPaths> {
  const source = Bun.file(COLLAB_REFERENCE_SOURCE_PATH)
  if (!(await source.exists())) {
    throw new Error('The collab guide is unavailable in this build: COLLAB.md is missing.')
  }
  const reference = await source.text()
  const paths = targetPaths(workspacePath, type)
  await writeChanged(paths.referencePath, reference)
  await installCollabDeclaration(workspacePath)
  return paths
}

export async function removeCollabSkill(
  workspacePath: string,
  type?: WorkspaceType
): Promise<void> {
  const paths = targetPaths(workspacePath, type)
  await rm(paths.referencePath, { force: true })
  await rm(paths.typesPath, { force: true })
}
