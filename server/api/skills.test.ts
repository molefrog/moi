import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { WorkspaceSkillsStatus } from '@/lib/types'

import { api } from './index'
import { DEFAULT_REGISTRY_PATH, registerWorkspace, setRegistryPath } from '../workspaces/registry'
import { readSkillVersion } from '../skills/version'
import { BUNDLED_SKILLS_DIR, installBundledSkills } from '../skills/template'
import { skillsDirFor } from '../workspaces/init'

let tempRoot = ''

beforeEach(async () => {
  tempRoot = await mkdtemp(join(tmpdir(), 'moi-api-skills-'))
  setRegistryPath(join(tempRoot, 'workspaces.json'))
})

afterEach(async () => {
  setRegistryPath(DEFAULT_REGISTRY_PATH)
  await rm(tempRoot, { recursive: true, force: true })
  tempRoot = ''
})

async function createOutdatedWorkspace(
  type: 'claude-code' | 'codex',
  registeredType: 'claude-code' | 'codex' = type
) {
  const workspaceRoot = join(tempRoot, type)
  const skillDir = join(skillsDirFor(workspaceRoot, type), 'moi-workspace')
  await mkdir(skillDir, { recursive: true })
  await Bun.write(join(skillDir, 'SKILL.md'), '<moi-skill version="0.7.1" />\n')
  return registerWorkspace(workspaceRoot, { type: registeredType })
}

describe('workspace skills API', () => {
  for (const staleType of ['claude-code', 'codex'] as const) {
    test(`reports and updates a stale ${staleType} copy alongside a current copy`, async () => {
      const currentType = staleType === 'codex' ? 'claude-code' : 'codex'
      const workspace = await createOutdatedWorkspace(staleType, currentType)
      await installBundledSkills(skillsDirFor(workspace.path, currentType))
      const response = await api.request(`/api/workspaces/${workspace.id}/skills`)
      const before = (await response.json()) as WorkspaceSkillsStatus
      expect(response.status).toBe(200)
      expect(before.skills).toHaveLength(2)
      expect(before.updateAvailable).toBe(true)
      const updated = await api.request(`/api/workspaces/${workspace.id}/skills/update`, {
        method: 'POST'
      })
      const after = (await updated.json()) as WorkspaceSkillsStatus
      expect(updated.status).toBe(200)
      expect(after.updateAvailable).toBe(false)
      expect(after.skills).toHaveLength(2)
      for (const skill of after.skills) {
        expect(skill.installed).toBe(skill.bundled)
        expect(await readSkillVersion(join(skill.path, 'SKILL.md'))).toBe(skill.bundled)
      }
    })
  }

  test('reports an actionable bundled-skill update', async () => {
    const workspace = await createOutdatedWorkspace('codex')

    const response = await api.request(`/api/workspaces/${workspace.id}/skills`)
    const status = (await response.json()) as WorkspaceSkillsStatus

    // Read the shipped version rather than pinning it — the assertion is that
    // an outdated install reports an update, not what today's version happens
    // to be. Pinning it means every skill bump breaks this test.
    const bundled = await readSkillVersion(join(BUNDLED_SKILLS_DIR, 'moi-workspace', 'SKILL.md'))

    expect(response.status).toBe(200)
    expect(status.updateAvailable).toBe(true)
    expect(bundled).not.toBeNull()
    expect(status.skills.find(skill => skill.name === 'moi-workspace')).toMatchObject({
      installed: '0.7.1',
      bundled
    })
  })

  test('updates bundled skills', async () => {
    const workspace = await createOutdatedWorkspace('codex')
    const customSkill = join(skillsDirFor(workspace.path, 'codex'), 'custom', 'SKILL.md')
    await mkdir(join(customSkill, '..'), { recursive: true })
    await Bun.write(customSkill, 'custom\n')

    const response = await api.request(`/api/workspaces/${workspace.id}/skills/update`, {
      method: 'POST'
    })
    const status = (await response.json()) as WorkspaceSkillsStatus

    expect(response.status).toBe(200)
    expect(status.updateAvailable).toBe(false)
    expect(await Bun.file(customSkill).text()).toBe('custom\n')
  })
})
