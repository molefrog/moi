import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type * as CollabApi from 'moi/collab'
import type { AppletCollabApi } from '@/client/features/collab/applet-api'
import type { USER_COLORS } from '@/lib/collab/colors'
import type { WorkspaceType } from '@/lib/types'
import { resetAppConfig } from '../../app-config'
import { updateWorkspaceSkills } from '../../skills/update'
import { provisionWorkspace } from '../../workspaces/init'
import { collabSkillReferencePath } from './index'

// This assignment is checked by tsc without importing React into the server.
const declarationsMatch: AppletCollabApi extends typeof CollabApi ? true : false = true
// `satisfies` checks palette entries; this checks that none are missing.
const paletteDeclarationsMatch: CollabApi.UserColor extends (typeof USER_COLORS)[number]
  ? true
  : false = true

test('workspace declarations match the public hooks and components', () => {
  expect(declarationsMatch).toBe(true)
  expect(paletteDeclarationsMatch).toBe(true)
})

test('cloud setup and skill updates install presence resources for each harness', async () => {
  const original = process.env.MOI_ENVIRONMENT
  const root = await mkdtemp(join(tmpdir(), 'moi-cloud-skills-'))
  try {
    const types: WorkspaceType[] = ['claude-code', 'codex', 'openclaw', 'hermes']
    for (const type of types) {
      const path = join(root, type)
      await Bun.write(join(path, '.moi', 'package.json'), '{}')
      process.env.MOI_ENVIRONMENT = 'local'
      resetAppConfig()
      await provisionWorkspace(path, type)
      const guide = collabSkillReferencePath(path, type)
      const declaration = join(path, '.moi', 'collab.d.ts')
      expect(await Bun.file(guide).exists()).toBe(false)
      expect(await Bun.file(declaration).exists()).toBe(false)
      process.env.MOI_ENVIRONMENT = 'cloud'
      resetAppConfig()
      await updateWorkspaceSkills(path, type)
      expect(await Bun.file(guide).exists()).toBe(true)
      expect(await Bun.file(declaration).exists()).toBe(true)
      await provisionWorkspace(path, type)
      expect(await Bun.file(guide).exists()).toBe(true)
    }
  } finally {
    if (original === undefined) delete process.env.MOI_ENVIRONMENT
    else process.env.MOI_ENVIRONMENT = original
    resetAppConfig()
    await rm(root, { recursive: true, force: true })
  }
})
