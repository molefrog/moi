import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { WorkspaceSkillsStatus } from '@/lib/types'

import { api } from './api'
import { DEFAULT_REGISTRY_PATH, registerWorkspace, setRegistryPath } from './registry'
import { skillsDirFor } from './workspace-init'

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

async function createOutdatedWorkspace(type: 'claude-code' | 'codex') {
  const workspaceRoot = join(tempRoot, type)
  const skillDir = join(skillsDirFor(workspaceRoot, type), 'moi-workspace')
  await mkdir(skillDir, { recursive: true })
  await Bun.write(join(skillDir, 'SKILL.md'), '<moi-skill version="0.7.1" />\n')
  return registerWorkspace(workspaceRoot, { type })
}

describe('workspace skills API', () => {
  test('reports an actionable bundled-skill update', async () => {
    const workspace = await createOutdatedWorkspace('codex')

    const response = await api.request(`/api/workspaces/${workspace.id}/skills`)
    const status = (await response.json()) as WorkspaceSkillsStatus

    expect(response.status).toBe(200)
    expect(status.updateAvailable).toBe(true)
    expect(status.skills.find(skill => skill.name === 'moi-workspace')).toMatchObject({
      installed: '0.7.1',
      bundled: '0.9.0'
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
