import { join } from 'node:path'
import type { WorkspaceType } from '@/lib/types'
import { skillsDirFor } from '../../workspaces/init'

export function collabSkillReferencePath(workspacePath: string, type?: WorkspaceType): string {
  return join(skillsDirFor(workspacePath, type), 'moi-workspace', 'references', 'COLLAB.md')
}
