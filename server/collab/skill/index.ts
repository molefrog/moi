import { mkdir, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import type { WorkspaceType } from '@/lib/types'

import { skillsDirFor } from '../../workspace-init'

export const COLLAB_REFERENCE_SOURCE_PATH = join(import.meta.dir, 'references', 'COLLABORATIVE.md')
const TYPES_SOURCE_PATH = join(import.meta.dir, 'collab-env.d.ts')

export type CollabSkillPaths = { referencePath: string; typesPath: string }

export function collabSkillReferencePath(workspacePath: string, type?: WorkspaceType): string {
  return join(skillsDirFor(workspacePath, type), 'moi-workspace', 'references', 'COLLABORATIVE.md')
}

function targetPaths(workspacePath: string, type?: WorkspaceType): CollabSkillPaths {
  return {
    referencePath: collabSkillReferencePath(workspacePath, type),
    typesPath: join(workspacePath, '.moi', 'collab-env.d.ts')
  }
}

async function writeChanged(path: string, contents: string): Promise<void> {
  const file = Bun.file(path)
  if ((await file.exists()) && (await file.text()) === contents) return
  await mkdir(dirname(path), { recursive: true })
  await Bun.write(path, contents)
}

// Keep this outside the ordinary skill template: only an explicit
// `moi init --experimental-collab` installs the guide and types.
export async function installCollabSkill(
  workspacePath: string,
  type?: WorkspaceType
): Promise<CollabSkillPaths> {
  const source = Bun.file(COLLAB_REFERENCE_SOURCE_PATH)
  if (!(await source.exists())) {
    throw new Error(
      'The collaboration guide is unavailable in this build: COLLABORATIVE.md is missing.'
    )
  }
  const [reference, declarations] = await Promise.all([
    source.text(),
    Bun.file(TYPES_SOURCE_PATH).text()
  ])
  const paths = targetPaths(workspacePath, type)
  await writeChanged(paths.referencePath, reference)
  await writeChanged(paths.typesPath, declarations)
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
