import { afterEach, describe, expect, test } from 'bun:test'
import { exists, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { WorkspaceType } from '@/lib/types'

import { APPLET_ENV_DTS } from '../moi-scaffold'
import { readSkillVersion } from '../skill-version'
import { getWorkspaceSkillsStatus, updateWorkspaceSkills } from '../skill-update'
import { BUNDLED_SKILLS_DIR } from '../skills-template'
import { skillsDirFor } from '../workspace-init'

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
  for (const type of ['claude-code', 'codex', 'openclaw'] as const) {
    test(`reads ${type} skills from the agent-specific directory`, async () => {
      tempRoot = await mkdtemp(join(tmpdir(), `moi-skill-status-${type}-`))
      await writeInstalledVersion(tempRoot, type, '0.7.1')

      const status = await getWorkspaceSkillsStatus(tempRoot, type)

      expect(status.updateAvailable).toBe(true)
      expect(status.skills).toContainEqual({
        name: 'moi-workspace',
        installed: '0.7.1',
        bundled: await readSkillVersion(join(BUNDLED_SKILLS_DIR, 'moi-workspace', 'SKILL.md'))
      })
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
    expect(await Bun.file(customSkill).text()).toBe('custom\n')
  })

  // The ambient applet types are the other agent-facing contract the CLI ships,
  // and drift the same way skills do — a workspace scaffolded before `focusTab`
  // existed keeps declaring a `moi` module without it until something rewrites
  // the file. `moi skill update` and the UI's update button both land here.
  test('regenerates the ambient applet types, replacing a stale copy', async () => {
    tempRoot = await mkdtemp(join(tmpdir(), 'moi-skill-applet-env-'))
    await writeInstalledVersion(tempRoot, 'codex', '0.7.1')
    const dts = join(tempRoot, '.moi', 'applet-env.d.ts')
    await Bun.write(dts, "declare module 'moi' { export function fileUrl(p: string): string }\n")

    const result = await updateWorkspaceSkills(tempRoot, 'codex')

    expect(result.appletTypesWritten).toBe(true)
    expect(await Bun.file(dts).text()).toBe(APPLET_ENV_DTS)
  })

  // Skills install anywhere, applet types only belong to a scaffolded
  // workspace: updating in a directory with no `.moi/` must not create one
  // holding a lone declaration file.
  test('skips the applet types when the workspace has no .moi', async () => {
    tempRoot = await mkdtemp(join(tmpdir(), 'moi-skill-no-moi-'))
    await writeInstalledVersion(tempRoot, 'codex', '0.7.1')

    const result = await updateWorkspaceSkills(tempRoot, 'codex')

    expect(result.appletTypesWritten).toBe(false)
    expect(await exists(join(tempRoot, '.moi'))).toBe(false)
  })
})
