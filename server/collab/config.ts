import type { WorkspaceType } from '@/lib/types'

import { getAppConfig } from '../app-config'
import { collabSkillReferencePath } from './skill'

export function isCollabEnabled(): boolean {
  return getAppConfig().collabEnabled
}

export async function getCollabReferencePath(
  workspacePath: string,
  type?: WorkspaceType
): Promise<string | undefined> {
  if (!isCollabEnabled()) return undefined
  const referencePath = collabSkillReferencePath(workspacePath, type)
  return (await Bun.file(referencePath).exists()) ? referencePath : undefined
}
