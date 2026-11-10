import { lstat, mkdir, mkdtemp, readlink, realpath, rename, rm, symlink } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'

import type { WorkspaceType } from '@/lib/types'

import { installBundledSkill, installBundledSkills, matchesBundledSkill } from './template'
import { skillsDirFor } from '../workspaces/init'
import { withSkillLock } from './lock'

const SKILL_NAME = 'moi-workspace'

export function usesSharedWorkspaceSkill(type?: WorkspaceType): boolean {
  return type === undefined || type === 'claude-code' || type === 'codex'
}

async function entryAt(path: string) {
  return lstat(path).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  })
}

// Replacing a whole-folder link would also change unrelated skills.
async function checkSkillsDirectory(path: string): Promise<void> {
  if ((await entryAt(path))?.isSymbolicLink()) {
    throw new Error(
      `Cannot install workspace skill: ${path} is a symlink; use a real skills directory`
    )
  }
}

export async function installWorkspaceSkills(
  root: string,
  type?: WorkspaceType
): Promise<string[]> {
  return withSkillLock(workspaceSkillLockPath(root, type), () =>
    installWorkspaceSkillFiles(root, type)
  )
}

export function workspaceSkillLockPath(root: string, type?: WorkspaceType): string {
  return usesSharedWorkspaceSkill(type) ? join(root, '.agents', 'skills') : skillsDirFor(root, type)
}

// Callers must hold the workspace skill lock across any surrounding status reads.
export async function installWorkspaceSkillFiles(
  root: string,
  type?: WorkspaceType
): Promise<string[]> {
  if (usesSharedWorkspaceSkill(type)) return resetWorkspaceSkill(root)
  const directory = skillsDirFor(root, type)
  return (await installBundledSkills(directory)).map(name => join(directory, name))
}

async function resetWorkspaceSkill(workspaceRoot: string): Promise<string[]> {
  const root = resolve(workspaceRoot)
  const canonical = join(root, '.agents', 'skills', SKILL_NAME)
  const claude = join(root, '.claude', 'skills', SKILL_NAME)
  try {
    await checkSkillsDirectory(dirname(canonical))
    await checkSkillsDirectory(dirname(claude))
    await mkdir(dirname(canonical), { recursive: true })
    await mkdir(dirname(claude), { recursive: true })
    const sharedDirectory =
      (await realpath(dirname(canonical))) === (await realpath(dirname(claude)))
    if (!sharedDirectory && (await entryAt(join(root, '.claude')))?.isSymbolicLink()) {
      throw new Error(
        'The .claude directory is a symlink; point it to .agents or use a real .claude directory'
      )
    }
    const linkTarget = relative(dirname(claude), canonical)
    const claudeEntry = await entryAt(claude)
    const linked =
      sharedDirectory || (claudeEntry?.isSymbolicLink() && (await readlink(claude)) === linkTarget)
    const matches = await matchesBundledSkill(SKILL_NAME, canonical)
    if (matches && linked) return []

    // Prepare the new files and link before removing either old skill. A copy
    // or symlink-permission failure leaves the installed copies available.
    const staging = await mkdtemp(join(dirname(canonical), '.moi-workspace-'))
    try {
      const skill = join(staging, SKILL_NAME)
      const link = join(staging, 'claude-link')
      if (!matches) await installBundledSkill(SKILL_NAME, skill)
      if (!linked) {
        try {
          await symlink(linkTarget, link, 'dir')
        } catch (cause) {
          const code = (cause as NodeJS.ErrnoException).code
          if (process.platform === 'win32' && (code === 'EPERM' || code === 'EACCES')) {
            throw new Error(
              'Windows could not create the workspace skill symlink; enable Developer Mode or run Moi as administrator, then retry',
              { cause }
            )
          }
          throw cause
        }
      }
      if (!matches) {
        await rm(canonical, { recursive: true, force: true })
        await rename(skill, canonical)
      }
      if (!linked) {
        await rm(claude, { recursive: true, force: true })
        await rename(link, claude)
      }
    } finally {
      await rm(staging, { recursive: true, force: true })
    }
    return matches ? [claude] : [canonical, claude]
  } catch (cause) {
    throw new Error(
      `Cannot reset workspace skill at ${canonical} and ${claude}: ${String(cause)}`,
      {
        cause
      }
    )
  }
}
