import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { chmod, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { WorkspaceSkillsStatus, WorkspaceSkillsUpdateFailure } from '@/lib/types'

import { api } from './api'
import { DEFAULT_REGISTRY_PATH, registerWorkspace, setRegistryPath } from './registry'
import { skillsDirFor } from './workspace-init'

let tempRoot = ''
let originalPath: string | undefined

beforeEach(async () => {
  tempRoot = await mkdtemp(join(tmpdir(), 'moi-api-skills-'))
  setRegistryPath(join(tempRoot, 'workspaces.json'))
  originalPath = process.env.PATH
})

afterEach(async () => {
  process.env.PATH = originalPath
  setRegistryPath(DEFAULT_REGISTRY_PATH)
  await rm(tempRoot, { recursive: true, force: true })
  tempRoot = ''
})

async function makeBunx(exitCode: number): Promise<void> {
  const binDir = join(tempRoot, 'bin')
  const bunx = join(binDir, 'bunx')
  await mkdir(binDir, { recursive: true })
  await Bun.write(bunx, `#!/bin/sh\nexit ${exitCode}\n`)
  await chmod(bunx, 0o755)
  process.env.PATH = binDir
}

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

  test('updates bundled and official skills', async () => {
    await makeBunx(0)
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

  test('returns refreshed status when shadcn fails', async () => {
    await makeBunx(23)
    const workspace = await createOutdatedWorkspace('claude-code')

    const response = await api.request(`/api/workspaces/${workspace.id}/skills/update`, {
      method: 'POST'
    })
    const failure = (await response.json()) as WorkspaceSkillsUpdateFailure

    expect(response.status).toBe(502)
    expect(failure.updateAvailable).toBe(false)
    expect(failure.error).toContain(
      'moi skill updated, but the official shadcn skill could not be refreshed'
    )
  })
})
