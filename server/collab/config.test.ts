import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { clientAppConfig, initializeAppConfig, resetAppConfig } from '../app-config'
import { getCollabReferencePath, isCollabEnabled } from './config'
import { collabSkillReferencePath } from './skill'

let workspacePath: string
const envKeys = ['MOI_COLLAB', 'MOI_DEV', 'MOI_ENVIRONMENT']
let savedEnv: Record<string, string | undefined>
beforeEach(async () => {
  workspacePath = await mkdtemp(join(tmpdir(), 'moi-collab-config-'))
  savedEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]))
  for (const key of envKeys) delete process.env[key]
  process.env.MOI_ENVIRONMENT = 'local'
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

describe('collab startup configuration', () => {
  test('dev mode, old environment settings and legacy workspace flags do not enable runtime', async () => {
    process.env.MOI_DEV = '1'
    process.env.MOI_COLLAB = '1'
    await Bun.write(
      join(workspacePath, '.moi', '.workspace.json'),
      JSON.stringify({ version: 1, experimental: { collab: true } })
    )
    expect(isCollabEnabled()).toBe(false)
    expect(clientAppConfig().environment === 'cloud').toBe(false)
    expect(await getCollabReferencePath(workspacePath)).toBeUndefined()
  })

  test('cloud collaboration stays disabled without changing workspace files', async () => {
    process.env.MOI_ENVIRONMENT = 'cloud'
    initializeAppConfig()
    expect(isCollabEnabled()).toBe(false)
    expect(clientAppConfig().environment === 'cloud').toBe(true)
    expect(clientAppConfig().collab).toBe(false)
    expect(await getCollabReferencePath(workspacePath)).toBeUndefined()
    expect(await getCollabReferencePath(join(workspacePath, 'another'))).toBeUndefined()
    expect(await Bun.file(join(workspacePath, '.moi', '.workspace.json')).exists()).toBe(false)
    expect(await Bun.file(collabSkillReferencePath(workspacePath)).exists()).toBe(false)
  })

  test('runtime stays disabled across cloud and local initialization and reset', () => {
    process.env.MOI_ENVIRONMENT = 'cloud'
    initializeAppConfig()
    expect(isCollabEnabled()).toBe(false)
    expect(clientAppConfig().environment === 'cloud').toBe(true)
    process.env.MOI_ENVIRONMENT = 'local'
    initializeAppConfig()
    expect(isCollabEnabled()).toBe(false)
    expect(clientAppConfig().environment === 'cloud').toBe(false)
    process.env.MOI_ENVIRONMENT = 'cloud'
    initializeAppConfig()
    expect(isCollabEnabled()).toBe(false)
    expect(clientAppConfig().environment === 'cloud').toBe(true)
    process.env.MOI_ENVIRONMENT = 'local'
    resetAppConfig()
    expect(isCollabEnabled()).toBe(false)
    expect(clientAppConfig().environment === 'cloud').toBe(false)
  })

  test('hides installed collaboration instructions while runtime is disabled', async () => {
    const referencePath = collabSkillReferencePath(workspacePath)
    await Bun.write(referencePath, '# Collab')
    expect(await getCollabReferencePath(workspacePath)).toBeUndefined()
    process.env.MOI_ENVIRONMENT = 'cloud'
    initializeAppConfig()
    expect(await getCollabReferencePath(workspacePath)).toBeUndefined()
  })
})
