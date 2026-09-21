import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { clientAppConfig, resetAppConfig } from '../app-config'
import { getCollabReferencePath, isCollabEnabled } from './config'
import { collabSkillReferencePath } from './skill'

let workspacePath: string
const envKeys = ['MOI_EXPERIMENTAL_COLLAB', 'MOI_COLLAB', 'MOI_DEV', 'MOI_COLLAB_IDENTITY']
let savedEnv: Record<string, string | undefined>
beforeEach(async () => {
  workspacePath = await mkdtemp(join(tmpdir(), 'moi-collab-config-'))
  savedEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]))
  for (const key of envKeys) delete process.env[key]
  resetAppConfig()
})
afterEach(async () => {
  for (const key of envKeys) {
    if (savedEnv[key] === undefined) delete process.env[key]
    else process.env[key] = savedEnv[key]
  }
  resetAppConfig()
  await rm(workspacePath, { recursive: true, force: true })
})

describe('collab process opt-in', () => {
  test('dev mode, old environment settings and legacy workspace flags do not enable runtime', async () => {
    process.env.MOI_DEV = '1'
    process.env.MOI_COLLAB = '1'
    process.env.MOI_COLLAB_IDENTITY = 'local'
    await Bun.write(
      join(workspacePath, '.moi', '.workspace.json'),
      JSON.stringify({ version: 1, experimental: { collab: true } })
    )
    expect(isCollabEnabled()).toBe(false)
    expect(clientAppConfig().experimentalCollab).toBe(false)
    expect(await getCollabReferencePath(workspacePath)).toBeUndefined()
  })

  test('the process flag enables every workspace without configuration or files', async () => {
    process.env.MOI_EXPERIMENTAL_COLLAB = '1'
    expect(isCollabEnabled()).toBe(true)
    expect(clientAppConfig().experimentalCollab).toBe(true)
    expect(await getCollabReferencePath(workspacePath)).toBeUndefined()
    expect(await getCollabReferencePath(join(workspacePath, 'another'))).toBeUndefined()
    expect(await Bun.file(join(workspacePath, '.moi', '.workspace.json')).exists()).toBe(false)
    expect(await Bun.file(collabSkillReferencePath(workspacePath)).exists()).toBe(false)
  })

  test('runtime and client flag stay in agreement until the process config is reset', () => {
    process.env.MOI_EXPERIMENTAL_COLLAB = '1'
    expect(isCollabEnabled()).toBe(true)
    process.env.MOI_EXPERIMENTAL_COLLAB = '0'
    expect(isCollabEnabled()).toBe(true)
    expect(clientAppConfig().experimentalCollab).toBe(true)
    resetAppConfig()
    expect(isCollabEnabled()).toBe(false)
    expect(clientAppConfig().experimentalCollab).toBe(false)
  })

  test('only advertises an already installed guide when runtime is enabled', async () => {
    const referencePath = collabSkillReferencePath(workspacePath)
    await Bun.write(referencePath, '# Collaborative applets')
    expect(await getCollabReferencePath(workspacePath)).toBeUndefined()
    process.env.MOI_EXPERIMENTAL_COLLAB = '1'
    resetAppConfig()
    expect(await getCollabReferencePath(workspacePath)).toBe(referencePath)
  })
})
