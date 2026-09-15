import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { collabReferencePath, getCollabCapability, isCollabEnabled } from './config'

let workspacePath: string
const envKeys = ['MOI_EXPERIMENTAL_COLLAB', 'MOI_COLLAB', 'MOI_DEV', 'MOI_COLLAB_IDENTITY']
let savedEnv: Record<string, string | undefined>
beforeEach(async () => {
  workspacePath = await mkdtemp(join(tmpdir(), 'moi-collab-config-'))
  savedEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]))
  for (const key of envKeys) delete process.env[key]
})
afterEach(async () => {
  for (const key of envKeys) {
    if (savedEnv[key] === undefined) delete process.env[key]
    else process.env[key] = savedEnv[key]
  }
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
    expect(await getCollabCapability(workspacePath)).toEqual({ enabled: false })
  })

  test('the process flag enables every workspace without configuration or files', async () => {
    process.env.MOI_EXPERIMENTAL_COLLAB = '1'
    expect(isCollabEnabled()).toBe(true)
    expect(await getCollabCapability(workspacePath)).toEqual({ enabled: true })
    expect(await getCollabCapability(join(workspacePath, 'another'))).toEqual({ enabled: true })
    expect(await Bun.file(join(workspacePath, '.moi', '.workspace.json')).exists()).toBe(false)
    expect(await Bun.file(collabReferencePath(workspacePath)).exists()).toBe(false)
    process.env.MOI_EXPERIMENTAL_COLLAB = '0'
    expect(isCollabEnabled()).toBe(false)
  })

  test('only advertises an already installed guide when runtime is enabled', async () => {
    const referencePath = collabReferencePath(workspacePath)
    await Bun.write(referencePath, '# Collaborative applets')
    expect(await getCollabCapability(workspacePath)).toEqual({ enabled: false })
    process.env.MOI_EXPERIMENTAL_COLLAB = '1'
    expect(await getCollabCapability(workspacePath)).toEqual({ enabled: true, referencePath })
  })
})
