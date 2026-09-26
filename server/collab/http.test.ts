import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import type { CollabServerMessage } from '@/lib/collab/types'
import type { WorkspaceEntry } from '@/lib/types'

import { api } from '../api'
import { clientAppConfig, resetAppConfig } from '../app-config'
import { DEFAULT_REGISTRY_PATH, setRegistryPath } from '../registry'
import { collabManager, type CollabSocket } from './manager'
import { collabSkillReferencePath } from './skill'

let directory: string
let workspace: WorkspaceEntry
let savedEnv: Record<string, string | undefined>
const envKeys = ['MOI_EXPERIMENTAL_COLLAB', 'MOI_COLLAB', 'MOI_DEV']

async function until(predicate: () => boolean) {
  const deadline = Date.now() + 5000
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('Timed out waiting for collab cleanup')
    await Bun.sleep(10)
  }
}

beforeEach(async () => {
  savedEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]))
  for (const key of envKeys) delete process.env[key]
  resetAppConfig()
  directory = await mkdtemp(join(tmpdir(), 'moi-collab-http-'))
  workspace = {
    id: 'test-collab',
    path: directory,
    type: 'codex',
    addedAt: new Date().toISOString()
  }
  const registryPath = join(directory, 'workspaces.json')
  setRegistryPath(registryPath)
  await Bun.write(registryPath, JSON.stringify([workspace]))
})

afterEach(async () => {
  const canonicalPath = await realpath(directory)
  await collabManager.stopWorkspace(directory)
  await until(
    () => !collabManager.debugSnapshot().some(slot => slot.workspacePath === canonicalPath)
  )
  for (const key of envKeys) {
    if (savedEnv[key] === undefined) delete process.env[key]
    else process.env[key] = savedEnv[key]
  }
  resetAppConfig()
  setRegistryPath(DEFAULT_REGISTRY_PATH)
  await rm(directory, { recursive: true, force: true })
})

function post(path: string, body: unknown) {
  return api.request(`/api/workspaces/${workspace.id}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
}

function command(command: unknown, id = 'agent') {
  return post('/collab/command', { actor: { id, kind: 'agent' }, command })
}

function enable() {
  process.env.MOI_EXPERIMENTAL_COLLAB = '1'
  resetAppConfig()
  expect(clientAppConfig().experimentalCollab).toBe(true)
}

describe('collab HTTP integration', () => {
  test('ordinary and dev starts remain disabled without creating data', async () => {
    expect((await api.request(`/api/workspaces/${workspace.id}/collab`)).status).toBe(404)
    expect(clientAppConfig().experimentalCollab).toBe(false)
    expect((await post('/collab', { enabled: true })).status).toBe(404)
    expect((await command({ type: 'snapshot', scope: 'board' })).status).toBe(404)
    process.env.MOI_DEV = '1'
    resetAppConfig()
    expect(clientAppConfig().experimentalCollab).toBe(false)
    expect((await command({ type: 'snapshot', scope: 'board' })).status).toBe(404)
    expect(await Bun.file(collabSkillReferencePath(directory, workspace.type)).exists()).toBe(false)
    expect(await Bun.file(join(directory, '.moi', 'data', 'collab.sqlite')).exists()).toBe(false)
  })

  test('runtime flag does not install documents, identity or workspace configuration', async () => {
    const referencePath = collabSkillReferencePath(directory, workspace.type)
    const defaultSkillPath = join(dirname(dirname(referencePath)), 'SKILL.md')
    const defaultSkill = '# moi workspace\nExisting workspace instructions.\n'
    await Bun.write(defaultSkillPath, defaultSkill)
    enable()
    expect((await api.request(`/api/workspaces/${workspace.id}/collab`)).status).toBe(404)
    expect((await post('/collab', { enabled: true })).status).toBe(404)
    expect(await Bun.file(join(directory, '.moi', '.workspace.json')).exists()).toBe(false)
    expect(await Bun.file(defaultSkillPath).text()).toBe(defaultSkill)
    expect(await Bun.file(referencePath).exists()).toBe(false)
    expect(await Bun.file(join(directory, '.moi', 'collab-env.d.ts')).exists()).toBe(false)
    expect(await Bun.file(join(directory, '.moi', 'data', 'collab.sqlite')).exists()).toBe(false)
  })

  test('startup config reports availability while workspace info exposes only an installed guide', async () => {
    const workspaceUrl = `/api/workspaces/${workspace.id}`
    await Bun.write(
      join(directory, '.moi', '.workspace.json'),
      JSON.stringify({
        version: 1,
        widgetGrid: [],
        collab: { enabled: true },
        collabReference: '/stale/guide.md'
      })
    )
    const referencePath = collabSkillReferencePath(directory, workspace.type)
    for (const enabled of [false, true]) {
      if (enabled) enable()
      const startup = await api.request('/api/config')
      expect((await startup.json()).experimentalCollab).toBe(enabled)
      const response = await api.request(workspaceUrl)
      expect(response.status).toBe(200)
      const info = await response.json()
      expect(info).not.toHaveProperty('collab')
      expect(info).not.toHaveProperty('enabled')
      expect(info).not.toHaveProperty('experimentalCollab')
      expect(info).not.toHaveProperty('collabReference')
      expect((await api.request(`${workspaceUrl}/collab`)).status).toBe(404)
    }
    await Bun.write(referencePath, '# Manually installed guide')
    expect((await (await api.request(workspaceUrl)).json()).collabReference).toBe(referencePath)
    process.env.MOI_EXPERIMENTAL_COLLAB = '0'
    resetAppConfig()
    expect(await (await api.request(workspaceUrl)).json()).not.toHaveProperty('collabReference')
  })

  test('persistent commands remain absent even when presence is enabled', async () => {
    enable()
    for (const commandType of ['snapshot', 'mutate', 'receipts', 'export']) {
      expect((await command({ type: commandType, scope: 'board' })).status).toBe(404)
    }
    expect(collabManager.debugSnapshot()).toEqual([])
    expect(await Bun.file(join(directory, '.moi', 'data', 'collab.sqlite')).exists()).toBe(false)
  })

  test('stopping presence preserves installed guides and any existing database file', async () => {
    enable()
    const referencePath = collabSkillReferencePath(directory, workspace.type)
    const databasePath = join(directory, '.moi', 'data', 'collab.sqlite')
    const previousDatabase = new Uint8Array([83, 81, 76, 105, 116, 101, 0, 1, 2, 3])
    await Bun.write(referencePath, '# Manually installed guide')
    await Bun.write(databasePath, previousDatabase)
    const messages: CollabServerMessage[] = []
    let closed = false
    const socket: CollabSocket = {
      send(data) {
        messages.push(JSON.parse(data) as CollabServerMessage)
        return data.length
      },
      close() {
        closed = true
      }
    }
    collabManager.open(socket, directory)
    collabManager.message(
      socket,
      JSON.stringify({
        type: 'join',
        version: 2,
        identity: { id: 'anna', name: 'Anna', color: 'blue' }
      })
    )
    await until(() => messages.some(message => message.type === 'welcome'))
    await collabManager.stopWorkspace(directory)
    process.env.MOI_EXPERIMENTAL_COLLAB = '0'
    resetAppConfig()
    expect(closed).toBe(true)
    expect(await Bun.file(referencePath).text()).toBe('# Manually installed guide')
    expect(new Uint8Array(await Bun.file(databasePath).arrayBuffer())).toEqual(previousDatabase)
    expect((await command({ type: 'snapshot', scope: 'board' })).status).toBe(404)
  })
})
