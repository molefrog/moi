import { lstat, realpath } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

import type { WorkspaceType } from '@/lib/types'

import { skillsDirFor } from '../workspaces/init'
import { bundledSkillNames } from './template'
import { usesSharedWorkspaceSkill } from './workspace'

type SkillDirectory = {
  targetPath: string
  exists: boolean
  brokenLink?: string
}

export type SkillLocation = SkillDirectory & {
  name: string
  path: string
}

// Resolve existing links, including links in parents of a missing installation.
// A dangling link is distinct from an absent directory. Claude/Codex can reset
// their owned skill links; other harnesses keep reporting them as errors.
async function inspectDirectory(path: string): Promise<SkillDirectory> {
  const entry = await lstat(path).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  })
  if (!entry) {
    const parent = await inspectDirectory(dirname(path))
    return { ...parent, exists: false, targetPath: join(parent.targetPath, basename(path)) }
  }
  try {
    return { exists: true, targetPath: await realpath(path) }
  } catch (error) {
    if (
      entry.isSymbolicLink() &&
      ['ENOENT', 'ELOOP'].includes((error as NodeJS.ErrnoException).code ?? '')
    ) {
      return { exists: true, targetPath: path, brokenLink: path }
    }
    throw error
  }
}

// Claude/Codex require both paths to the shared skill. Other harnesses require
// their primary destination and include existing Claude/Codex installations.
export async function resolveSkillLocations(
  workspaceRoot: string,
  type?: WorkspaceType
): Promise<SkillLocation[]> {
  const root = resolve(workspaceRoot)
  const primary = resolve(skillsDirFor(root, type))
  const directories = [
    ...new Set([primary, join(root, '.claude', 'skills'), join(root, '.agents', 'skills')])
  ]
  const locations: SkillLocation[] = []
  for (const name of await bundledSkillNames()) {
    for (const directory of directories) {
      const path = join(directory, name)
      try {
        const inspected = await inspectDirectory(path)
        if (
          usesSharedWorkspaceSkill(type) ||
          directory === primary ||
          inspected.exists ||
          inspected.brokenLink
        ) {
          locations.push({ name, path, ...inspected })
        }
      } catch (cause) {
        throw new Error(`Cannot inspect skill at ${path}: ${String(cause)}`, { cause })
      }
    }
  }
  return locations
}

export function displaySkillPath(workspaceRoot: string, path: string): string {
  const local = relative(workspaceRoot, path)
  return local === '..' || local.startsWith(`..${sep}`) || isAbsolute(local) ? path : local
}
