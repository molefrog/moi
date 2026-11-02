import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test'
import { mkdir, mkdtemp, realpath, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import type { CollabServerMessage } from '@/lib/collab/types'
import type { WorkspaceEntry } from '@/lib/types'

import { api } from '../api'
import { clientAppConfig, initializeAppConfig, resetAppConfig } from '../app-config'
import { DEFAULT_REGISTRY_PATH, setRegistryPath } from '../workspaces/registry'
import { collabManager, type ClientSocket } from './manager'
import { collabSkillReferencePath } from './skill'
import * as collabConfig from './config'

let fixtureRoot: string
let directory: string
let canonicalPath: string
let registryPath: string
let workspace: WorkspaceEntry
let savedEnv: Record<string, string | undefined>
let restorePresence = () => {}
const envKeys = ['MOI_COLLAB', 'MOI_DEV', 'MOI_ENVIRONMENT']

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
  process.env.MOI_ENVIRONMENT = 'local'
  resetAppConfig()
  fixtureRoot = await mkdtemp(join(tmpdir(), 'moi-collab-http-'))
  directory = join(fixtureRoot, 'workspace')
  await mkdir(directory)
  canonicalPath = await realpath(directory)
  workspace = {
    id: 'test-collab',
    path: directory,
    type: 'codex',
    addedAt: new Date().toISOString()
  }
  registryPath = join(fixtureRoot, 'workspaces.json')
  setRegistryPath(registryPath)
  await Bun.write(registryPath, JSON.stringify([workspace]))
})

afterEach(async () => {
  await collabManager.stopWorkspace(workspace.path)
  await until(
    () => !collabManager.debugSnapshot().some(slot => slot.workspacePath === canonicalPath)
  )
  for (const key of envKeys) {
    if (savedEnv[key] === undefined) delete process.env[key]
    else process.env[key] = savedEnv[key]
  }
  restorePresence()
  resetAppConfig()
  setRegistryPath(DEFAULT_REGISTRY_PATH)
  await rm(fixtureRoot, { recursive: true, force: true })
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

function useCloudConfig() {
  process.env.MOI_ENVIRONMENT = 'cloud'
  initializeAppConfig()
  expect(clientAppConfig().environment === 'cloud').toBe(true)
}

function enablePresenceForTest() {
  useCloudConfig()
  const enabled = spyOn(collabConfig, 'isCollabEnabled').mockReturnValue(true)
  restorePresence = () => enabled.mockRestore()
}

describe('collab HTTP integration', () => {
  test.each(['local', 'cloud'])(
    '%s deployments reject presence joins without starting a worker',
    async environment => {
      process.env.MOI_ENVIRONMENT = environment
      initializeAppConfig()
      const messages: CollabServerMessage[] = []
      const socket: ClientSocket = {
        send(data) {
          messages.push(JSON.parse(data) as CollabServerMessage)
          return data.length
        },
        close() {}
      }
      collabManager.open(socket, directory)
      collabManager.message(
        socket,
        JSON.stringify({
          type: 'join',
          version: 1,
          profile: { id: 'anna', name: 'Anna', color: 'blue' }
        })
      )
      try {
        await until(() => messages.some(message => message.type === 'error'))
        expect(messages).toContainEqual(
          expect.objectContaining({ type: 'error', code: 'unavailable' })
        )
        expect(messages.some(message => message.type === 'welcome')).toBe(false)
        expect(collabManager.debugSnapshot()).toEqual([])
      } finally {
        collabManager.close(socket)
      }
    }
  )

  test('ordinary and dev starts remain disabled without creating data', async () => {
    expect(clientAppConfig().environment === 'cloud').toBe(false)
    expect((await command({ type: 'snapshot', scope: 'board' })).status).toBe(404)
    process.env.MOI_DEV = '1'
    resetAppConfig()
    expect(clientAppConfig().environment === 'cloud').toBe(false)
    expect((await command({ type: 'snapshot', scope: 'board' })).status).toBe(404)
    expect(await Bun.file(collabSkillReferencePath(directory, workspace.type)).exists()).toBe(false)
    expect(await Bun.file(join(directory, '.moi', 'data', 'collab.sqlite')).exists()).toBe(false)
  })

  test('cloud startup does not install documents, profile or workspace configuration', async () => {
    const referencePath = collabSkillReferencePath(directory, workspace.type)
    const defaultSkillPath = join(dirname(dirname(referencePath)), 'SKILL.md')
    const defaultSkill = '# Moi workspace\nExisting workspace instructions.\n'
    await Bun.write(defaultSkillPath, defaultSkill)
    useCloudConfig()
    expect(await Bun.file(join(directory, '.moi', '.workspace.json')).exists()).toBe(false)
    expect(await Bun.file(defaultSkillPath).text()).toBe(defaultSkill)
    expect(await Bun.file(referencePath).exists()).toBe(false)
    expect(await Bun.file(join(directory, '.moi', 'collab.d.ts')).exists()).toBe(false)
    expect(await Bun.file(join(directory, '.moi', 'data', 'collab.sqlite')).exists()).toBe(false)
  })

  test('startup config reports availability without exposing the reference path in workspace info', async () => {
    const workspaceUrl = `/api/workspaces/${workspace.id}`
    const referencePath = collabSkillReferencePath(directory, workspace.type)
    for (const enabled of [false, true]) {
      if (enabled) useCloudConfig()
      const startup = await api.request('/api/config')
      expect((await startup.json()).environment === 'cloud').toBe(enabled)
      const response = await api.request(workspaceUrl)
      expect(response.status).toBe(200)
      const info = await response.json()
      expect(info).not.toHaveProperty('collabReference')
    }
    await Bun.write(referencePath, '# Manually installed guide')
    expect(await (await api.request(workspaceUrl)).json()).not.toHaveProperty('collabReference')
    process.env.MOI_ENVIRONMENT = 'local'
    initializeAppConfig()
    expect(await (await api.request(workspaceUrl)).json()).not.toHaveProperty('collabReference')
  })

  test('the proxy user endpoint is never cached and ignores Access headers without Access', async () => {
    const headers = { 'Cf-Access-Jwt-Assertion': 'forged.token.value' }
    const response = await api.request('/api/proxy-user', { headers })
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(await response.json()).toEqual({})
  })

  test('persistent commands remain absent in cloud', async () => {
    useCloudConfig()
    for (const commandType of ['snapshot', 'mutate', 'receipts', 'export']) {
      expect((await command({ type: commandType, scope: 'board' })).status).toBe(404)
    }
    expect(collabManager.debugSnapshot()).toEqual([])
    expect(await Bun.file(join(directory, '.moi', 'data', 'collab.sqlite')).exists()).toBe(false)
  })

  test.each(['existing', 'missing-directory', 'missing-symlink'])(
    'removing a workspace closes joined sockets and stops its worker (%s)',
    async state => {
      enablePresenceForTest()
      if (state === 'missing-symlink') {
        workspace.path = join(fixtureRoot, 'workspace-link')
        await symlink(directory, workspace.path, 'dir')
        await Bun.write(registryPath, JSON.stringify([workspace]))
      }
      const server = Bun.serve({
        port: 0,
        hostname: '127.0.0.1',
        fetch(req, server) {
          if (new URL(req.url).pathname.endsWith('/collab/ws') && server.upgrade(req)) return
          return api.fetch(req)
        },
        websocket: {
          open: socket => collabManager.open(socket, workspace.path),
          message: (socket, message) => collabManager.message(socket, message),
          close: socket => collabManager.close(socket)
        }
      })
      const url = `http://127.0.0.1:${server.port}/api/workspaces/${workspace.id}`
      const socket = new WebSocket(`${url.replace('http:', 'ws:')}/collab/ws`)
      const messages: CollabServerMessage[] = []
      socket.onmessage = event => {
        messages.push(JSON.parse(String(event.data)) as CollabServerMessage)
      }
      try {
        await until(() => socket.readyState === WebSocket.OPEN)
        socket.send(
          JSON.stringify({
            type: 'join',
            version: 1,
            profile: { id: 'anna', name: 'Anna', color: 'blue' }
          })
        )
        await until(() => messages.some(message => message.type === 'welcome'))
        const room = collabManager
          .debugSnapshot()
          .find(slot => slot.workspacePath === canonicalPath)
        if (!room) throw new Error('Missing collab worker')
        expect(room.connections).toBe(1)
        if (state === 'missing-directory') await rm(directory, { recursive: true })
        if (state === 'missing-symlink') await rm(workspace.path)

        expect((await fetch(url, { method: 'DELETE' })).status).toBe(204)
        await until(() => socket.readyState === WebSocket.CLOSED)
        expect(
          collabManager.debugSnapshot().some(slot => slot.workspacePath === canonicalPath)
        ).toBe(false)
        expect(() => process.kill(room.pid, 0)).toThrow()
        expect((await api.request(`/api/workspaces/${workspace.id}`)).status).toBe(404)
      } finally {
        socket.close()
        server.stop(true)
      }
    }
  )

  test('removing a missing workspace without a presence room succeeds', async () => {
    await rm(directory, { recursive: true })
    expect(
      (await api.request(`/api/workspaces/${workspace.id}`, { method: 'DELETE' })).status
    ).toBe(204)
  })

  test('stopping presence preserves installed guides and any existing database file', async () => {
    enablePresenceForTest()
    const referencePath = collabSkillReferencePath(directory, workspace.type)
    const databasePath = join(directory, '.moi', 'data', 'collab.sqlite')
    const previousDatabase = new Uint8Array([83, 81, 76, 105, 116, 101, 0, 1, 2, 3])
    await Bun.write(referencePath, '# Manually installed guide')
    await Bun.write(databasePath, previousDatabase)
    const messages: CollabServerMessage[] = []
    let closed = false
    const socket: ClientSocket = {
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
        version: 1,
        profile: { id: 'anna', name: 'Anna', color: 'blue' }
      })
    )
    await until(() => messages.some(message => message.type === 'welcome'))
    await collabManager.stopWorkspace(directory)
    process.env.MOI_ENVIRONMENT = 'local'
    initializeAppConfig()
    expect(closed).toBe(true)
    expect(await Bun.file(referencePath).text()).toBe('# Manually installed guide')
    expect(new Uint8Array(await Bun.file(databasePath).arrayBuffer())).toEqual(previousDatabase)
    expect((await command({ type: 'snapshot', scope: 'board' })).status).toBe(404)
  })
})
