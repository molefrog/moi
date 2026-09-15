import { join } from 'node:path'

import type { WorkspaceType } from '@/lib/types'
import type { CollabCapability } from '@/lib/collab/types'
import { skillsDirFor } from '../workspace-init'

// The CLI owns this process setting. Workspace files and dev mode never enable it.
export function isCollabEnabled(): boolean {
  return process.env.MOI_EXPERIMENTAL_COLLAB === '1'
}

export function collabReferencePath(workspacePath: string, type?: WorkspaceType): string {
  return join(skillsDirFor(workspacePath, type), 'moi-workspace', 'references', 'COLLABORATIVE.md')
}

export async function getCollabCapability(
  workspacePath: string,
  type?: WorkspaceType
): Promise<CollabCapability> {
  const enabled = isCollabEnabled()
  const referencePath = enabled ? collabReferencePath(workspacePath, type) : undefined
  return {
    enabled,
    ...(referencePath && (await Bun.file(referencePath).exists()) ? { referencePath } : {})
  }
}
