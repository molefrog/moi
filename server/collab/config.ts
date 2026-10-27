import type { WorkspaceType } from '@/lib/types'

import { getAppConfig } from '../app-config'
import { collabSkillReferencePath } from './skill'

// Collaboration is available only on cloud deployments.
export function isCollabEnabled(): boolean {
  return getAppConfig().environment === 'cloud'
}

export async function getCollabReferencePath(
  workspacePath: string,
  type?: WorkspaceType
): Promise<string | undefined> {
  if (!isCollabEnabled()) return undefined
  const referencePath = collabSkillReferencePath(workspacePath, type)
  return (await Bun.file(referencePath).exists()) ? referencePath : undefined
}
