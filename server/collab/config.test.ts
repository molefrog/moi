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

    await Bun.write(
      join(workspacePath, '.moi', '.workspace.json'),
      JSON.stringify({ version: 1, experimental: { collab: true } })
    )
    expect(isCollabEnabled()).toBe(false)
    expect(clientAppConfig().environment === 'cloud').toBe(false)
    expect(await getCollabReferencePath(workspacePath)).toBeUndefined()
  })

  test('hides installed collaboration instructions while runtime is disabled', async () => {
    const referencePath = collabSkillReferencePath(workspacePath)
    await Bun.write(referencePath, '# Collab')
    expect(await getCollabReferencePath(workspacePath)).toBeUndefined()
    process.env.MOI_ENVIRONMENT = 'cloud'
    initializeAppConfig()
    expect(isCollabEnabled()).toBe(true)
    expect(await getCollabReferencePath(workspacePath)).toBe(referencePath)
  })
})
