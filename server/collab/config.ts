import type { WorkspaceType } from '@/lib/types'

import { getAppConfig } from '../app-config'
import { collabSkillReferencePath } from './skill'

export async function getCollabReferencePath(
  workspacePath: string,
  type?: WorkspaceType
): Promise<string | undefined> {
  if (getAppConfig().environment !== 'cloud') return undefined
  const referencePath = collabSkillReferencePath(workspacePath, type)
  return (await Bun.file(referencePath).exists()) ? referencePath : undefined
}
