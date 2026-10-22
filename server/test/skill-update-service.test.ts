import { afterEach, describe, expect, test } from 'bun:test'
import {
  chmod,
  exists,
  lstat,
  mkdir,
  mkdtemp,
  readlink,
  rm,
  stat,
  symlink,
  utimes
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { WorkspaceType } from '@/lib/types'

import {
  BASE_DECLARATION_SOURCE_PATH,
  COLLAB_DECLARATION_SOURCE_PATH
} from '../applets/declarations'
import { readSkillVersion } from '../skills/version'
import {
  getWorkspaceSkillsStatus,
  summarizeSkillStatuses,
  updateWorkspaceSkills
} from '../skills/update'
import { BUNDLED_SKILLS_DIR, installBundledSkills } from '../skills/template'
import { skillsDirFor } from '../workspaces/init'

let tempRoot = ''

afterEach(async () => {
  if (!tempRoot) return
  await rm(tempRoot, { recursive: true, force: true })
  tempRoot = ''
})

async function writeInstalledVersion(
  workspaceRoot: string,
  type: WorkspaceType,
  version: string
): Promise<void> {
  const skillDir = join(skillsDirFor(workspaceRoot, type), 'moi-workspace')
  await mkdir(skillDir, { recursive: true })
  await Bun.write(join(skillDir, 'SKILL.md'), `<moi-skill version="${version}" />\n`)
}

describe('workspace skill update service', () => {
  test('reports patch-only bundled versions as available updates', () => {
    const skills = [
      {
        name: 'moi-workspace',
        path: '/workspace/skills/moi-workspace',
        installed: '0.17.0',
        bundled: '0.17.1'
      }
    ]

    expect(summarizeSkillStatuses(skills)).toEqual({ skills, updateAvailable: true })
  })

  for (const type of ['claude-code', 'codex', 'openclaw', 'hermes'] as const) {
    test(`reads ${type} skills from the agent-specific directory`, async () => {
      tempRoot = await mkdtemp(join(tmpdir(), `moi-skill-status-${type}-`))
      await writeInstalledVersion(tempRoot, type, '0.7.1')

      const status = await getWorkspaceSkillsStatus(tempRoot, type)

      expect(status.updateAvailable).toBe(true)
      expect(status.skills).toContainEqual({
        name: 'moi-workspace',
        path: join(skillsDirFor(tempRoot, type), 'moi-workspace'),
        installed: '0.7.1',
        bundled: await readSkillVersion(join(BUNDLED_SKILLS_DIR, 'moi-workspace', 'SKILL.md'))
      })
    })
  }

  for (const primary of ['claude-code', 'codex', undefined] as const) {
    for (const stale of ['claude-code', 'codex'] as const) {
      test(`updates a stale ${stale} copy with ${primary ?? 'unregistered'} primary`, async () => {
        tempRoot = await mkdtemp(join(tmpdir(), 'moi-skill-copies-'))
        for (const type of ['claude-code', 'codex'] as const) {
          await installBundledSkills(skillsDirFor(tempRoot, type))
        }
        await writeInstalledVersion(tempRoot, stale, '0.13.0')
        const stalePath = join(skillsDirFor(tempRoot, stale), 'moi-workspace')
        await rm(join(stalePath, 'references', 'INTENTS.md'))
        await rm(join(stalePath, 'references', 'UI-COMPONENTS.md'))
        await Bun.write(join(stalePath, 'local.md'), 'keep this')
        await Bun.write(join(stalePath, 'references', 'COLLAB.md'), 'opted in')

        const before = await getWorkspaceSkillsStatus(tempRoot, primary)
        expect(before.updateAvailable).toBe(true)
        expect(before.skills).toHaveLength(2)
        expect(before.skills.find(skill => skill.path === stalePath)?.installed).toBe('0.13.0')

        const result = await updateWorkspaceSkills(tempRoot, primary)
        expect(result.changedSkills).toEqual(['moi-workspace'])
        expect(result.changedSkillPaths).toEqual([stalePath])
        expect(result.status.updateAvailable).toBe(false)
        for (const skill of result.status.skills) expect(skill.installed).toBe(skill.bundled)
        for (const reference of ['INTENTS.md', 'UI-COMPONENTS.md']) {
          expect(await Bun.file(join(stalePath, 'references', reference)).text()).toBe(
            await Bun.file(
              join(BUNDLED_SKILLS_DIR, 'moi-workspace', 'references', reference)
            ).text()
          )
        }
        expect(await Bun.file(join(stalePath, 'local.md')).text()).toBe('keep this')
        expect(await Bun.file(join(stalePath, 'references', 'COLLAB.md')).text()).toBe('opted in')
      })
    }
  }

  for (const primary of ['claude-code', 'codex'] as const) {
    test(`restores missing ${primary} primary without installing absent secondary skills`, async () => {
      tempRoot = await mkdtemp(join(tmpdir(), 'moi-skill-missing-'))
      const otherDirectory = primary === 'codex' ? '.claude' : '.agents'
      const otherSkills = join(tempRoot, otherDirectory, 'skills')
      await Bun.write(join(otherSkills, 'custom', 'SKILL.md'), 'custom')
      const before = await getWorkspaceSkillsStatus(tempRoot, primary)
      expect(before.skills).toHaveLength(1)
      expect(before.skills[0].installed).toBeNull()
      expect(before.updateAvailable).toBe(true)
      const result = await updateWorkspaceSkills(tempRoot, primary)
      expect(result.status.updateAvailable).toBe(false)
      expect(await exists(join(otherSkills, 'moi-workspace'))).toBe(false)
      expect(await Bun.file(join(otherSkills, 'custom', 'SKILL.md')).text()).toBe('custom')
    })
  }

  test('repairs an existing secondary directory with no version marker', async () => {
    tempRoot = await mkdtemp(join(tmpdir(), 'moi-skill-no-marker-'))
    await installBundledSkills(join(tempRoot, '.claude', 'skills'))
    const secondary = join(tempRoot, '.agents', 'skills', 'moi-workspace')
    await mkdir(secondary, { recursive: true })
    const before = await getWorkspaceSkillsStatus(tempRoot)
    expect(before.skills).toHaveLength(2)
    expect(before.skills.find(skill => skill.path === secondary)?.installed).toBeNull()
    expect(before.updateAvailable).toBe(true)
    expect((await updateWorkspaceSkills(tempRoot)).status.updateAvailable).toBe(false)
  })

  for (const level of ['skills', 'skill'] as const) {
    test(`preserves shared ${level} symlinks and leaves a second update untouched`, async () => {
      tempRoot = await mkdtemp(join(tmpdir(), 'moi-skill-symlink-'))
      await writeInstalledVersion(tempRoot, 'claude-code', '0.13.0')
      const claude = join(tempRoot, '.claude', 'skills', 'moi-workspace')
      const codex = join(tempRoot, '.agents', 'skills', 'moi-workspace')
      const link = level === 'skills' ? join(tempRoot, '.agents', 'skills') : codex
      const target = level === 'skills' ? '../.claude/skills' : '../../.claude/skills/moi-workspace'
      await mkdir(
        level === 'skills' ? join(tempRoot, '.agents') : join(tempRoot, '.agents', 'skills'),
        { recursive: true }
      )
      await symlink(target, link, 'dir')
      const result = await updateWorkspaceSkills(tempRoot, 'codex')
      expect(result.changedSkillPaths.sort()).toEqual([claude, codex].sort())
      expect(result.status.skills).toHaveLength(2)
      expect(result.status.updateAvailable).toBe(false)
      expect(await readlink(link)).toBe(target)
      const marker = join(claude, 'SKILL.md')
      const fixedTime = new Date('2000-01-01T00:00:00.000Z')
      await utimes(marker, fixedTime, fixedTime)
      const before = (await stat(marker)).mtimeMs
      const second = await updateWorkspaceSkills(tempRoot, 'codex')
      expect(second.changedSkills).toEqual([])
      expect(second.changedSkillPaths).toEqual([])
      expect((await stat(marker)).mtimeMs).toBe(before)
      expect((await lstat(link)).isSymbolicLink()).toBe(true)
    })

    test(`reports a broken ${level} symlink as stale and refuses to replace it`, async () => {
      tempRoot = await mkdtemp(join(tmpdir(), 'moi-skill-broken-link-'))
      await installBundledSkills(join(tempRoot, '.claude', 'skills'))
      const secondary = join(tempRoot, '.agents', 'skills', 'moi-workspace')
      const link = level === 'skills' ? join(tempRoot, '.agents', 'skills') : secondary
      await mkdir(
        level === 'skills' ? join(tempRoot, '.agents') : join(tempRoot, '.agents', 'skills'),
        { recursive: true }
      )
      await symlink('missing-target', link, 'dir')
      const before = await getWorkspaceSkillsStatus(tempRoot)
      expect(before.updateAvailable).toBe(true)
      expect(before.skills.find(skill => skill.path === secondary)?.installed).toBeNull()
      await expect(updateWorkspaceSkills(tempRoot)).rejects.toThrow(secondary)
      expect(await readlink(link)).toBe('missing-target')
      expect((await getWorkspaceSkillsStatus(tempRoot)).updateAvailable).toBe(true)
    })
  }

  for (const blocked of ['skill', 'references'] as const) {
    test.skipIf(process.getuid?.() === 0 || process.platform === 'win32')(
      `reports ${blocked} write failures with the copy path and keeps its stale status`,
      async () => {
        tempRoot = await mkdtemp(join(tmpdir(), 'moi-skill-read-only-'))
        await writeInstalledVersion(tempRoot, 'claude-code', '0.13.0')
        await writeInstalledVersion(tempRoot, 'codex', '0.13.0')
        const secondary = join(tempRoot, '.agents', 'skills', 'moi-workspace')
        const readOnly = blocked === 'skill' ? secondary : join(secondary, 'references')
        await mkdir(readOnly, { recursive: true })
        await chmod(readOnly, 0o555)
        try {
          await expect(updateWorkspaceSkills(tempRoot)).rejects.toThrow(secondary)
          const status = await getWorkspaceSkillsStatus(tempRoot)
          expect(status.updateAvailable).toBe(true)
          expect(status.skills.find(skill => skill.path === secondary)?.installed).toBe('0.13.0')
        } finally {
          await chmod(readOnly, 0o755)
        }
      }
    )
  }

  for (const type of ['openclaw', 'hermes'] as const) {
    test(`updates ${type} primary plus existing Claude and Codex copies`, async () => {
      tempRoot = await mkdtemp(join(tmpdir(), 'moi-skill-harnesses-'))
      const workspace = join(tempRoot, 'workspace')
      for (const harness of [type, 'claude-code', 'codex'] as const) {
        await writeInstalledVersion(workspace, harness, '0.13.0')
      }
      const primaryPath =
        type === 'hermes'
          ? join(tempRoot, 'skills', 'moi-workspace')
          : join(workspace, 'skills', 'moi-workspace')
      const result = await updateWorkspaceSkills(workspace, type)
      expect(result.status.skills).toHaveLength(3)
      expect(result.changedSkillPaths).toContain(primaryPath)
      expect(result.status.updateAvailable).toBe(false)
      expect(await readSkillVersion(join(primaryPath, 'SKILL.md'))).toBe(
        result.status.skills[0].bundled
      )
    })
  }

  test('updates bundled skills and preserves custom skills', async () => {
    tempRoot = await mkdtemp(join(tmpdir(), 'moi-skill-update-'))
    await writeInstalledVersion(tempRoot, 'codex', '0.7.1')
    const customSkill = join(skillsDirFor(tempRoot, 'codex'), 'custom', 'SKILL.md')
    await mkdir(join(customSkill, '..'), { recursive: true })
    await Bun.write(customSkill, 'custom\n')

    const result = await updateWorkspaceSkills(tempRoot, 'codex')

    expect(result.before.find(skill => skill.name === 'moi-workspace')?.installed).toBe('0.7.1')
    expect(result.status.updateAvailable).toBe(false)
    expect(result.changedSkills).toEqual(['moi-workspace'])
    expect(await Bun.file(customSkill).text()).toBe('custom\n')
  })

  test('reports no skill changes when installed files already match', async () => {
    tempRoot = await mkdtemp(join(tmpdir(), 'moi-skill-unchanged-'))
    await installBundledSkills(skillsDirFor(tempRoot, 'codex'))

    const result = await updateWorkspaceSkills(tempRoot, 'codex')

    expect(result.changedSkills).toEqual([])
  })

  // The ambient applet types are the other agent-facing contract the CLI ships,
  // and drift the same way skills do — a workspace scaffolded before `focusTab`
  // existed keeps declaring a `moi` module without it until something rewrites
  // the file. `moi skill update` and the UI's update button both land here.
  test('regenerates the ambient applet types, replacing a stale copy', async () => {
    tempRoot = await mkdtemp(join(tmpdir(), 'moi-skill-base-types-'))
    await writeInstalledVersion(tempRoot, 'codex', '0.7.1')
    const dts = join(tempRoot, '.moi', 'base.d.ts')
    await Bun.write(dts, "declare module 'moi' { export function resolveUrl(p: string): string }\n")

    const result = await updateWorkspaceSkills(tempRoot, 'codex')

    expect(result.updatedAppletTypes).toEqual(['base.d.ts'])
    expect(await Bun.file(dts).text()).toBe(await Bun.file(BASE_DECLARATION_SOURCE_PATH).text())
    expect(await Bun.file(join(tempRoot, '.moi', 'collab.d.ts')).exists()).toBe(false)
  })

  test('refreshes an installed collab declaration without opting in other workspaces', async () => {
    tempRoot = await mkdtemp(join(tmpdir(), 'moi-skill-collab-types-'))
    const dts = join(tempRoot, '.moi', 'collab.d.ts')
    await Bun.write(dts, "declare module 'moi/collab' {}\n")

    const result = await updateWorkspaceSkills(tempRoot, 'codex')

    expect(result.updatedAppletTypes).toEqual(['base.d.ts', 'collab.d.ts'])
    expect(await Bun.file(dts).text()).toBe(await Bun.file(COLLAB_DECLARATION_SOURCE_PATH).text())
    expect((await updateWorkspaceSkills(tempRoot, 'codex')).updatedAppletTypes).toEqual([])
  })

  // Skills install anywhere, applet types only belong to a scaffolded
  // workspace: updating in a directory with no `.moi/` must not create one
  // holding a lone declaration file.
  test('skips the applet types when the workspace has no .moi', async () => {
    tempRoot = await mkdtemp(join(tmpdir(), 'moi-skill-no-moi-'))
    await writeInstalledVersion(tempRoot, 'codex', '0.7.1')

    const result = await updateWorkspaceSkills(tempRoot, 'codex')

    expect(result.updatedAppletTypes).toEqual([])
    expect(await exists(join(tempRoot, '.moi'))).toBe(false)
  })
})
