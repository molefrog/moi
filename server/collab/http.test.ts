import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { Hono } from 'hono'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import type { CollabCommand, CollabServerMessage } from '@/lib/collab/types'
import type { WorkspaceEntry } from '@/lib/types'

import { collabReferencePath } from './config'
import { collabRoutes } from './http'
import { collabManager, type CollabSocket } from './manager'

let directory: string
let workspace: WorkspaceEntry
let app: Hono<{ Variables: { ws: WorkspaceEntry } }>
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
  directory = await mkdtemp(join(tmpdir(), 'moi-collab-http-'))
  workspace = {
    id: 'test-collab',
    path: directory,
    type: 'codex',
    addedAt: new Date().toISOString()
  }
  app = new Hono<{ Variables: { ws: WorkspaceEntry } }>()
  app.use('*', async (c, next) => {
    c.set('ws', workspace)
    await next()
  })
  app.route('/collab', collabRoutes)
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
  await rm(directory, { recursive: true, force: true })
})

function post(path: string, body: unknown) {
  return app.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
}

function command(command: CollabCommand, id = 'agent') {
  return post('/collab/command', { actor: { id, kind: 'agent' }, command })
}

async function enable() {
  process.env.MOI_EXPERIMENTAL_COLLAB = '1'
  const response = await app.request('/collab')
  expect(response.status).toBe(200)
  return response
}

describe('collab HTTP integration', () => {
  test('ordinary and dev starts remain disabled without creating data', async () => {
    expect(await (await app.request('/collab')).json()).toEqual({
      enabled: false
    })
    expect((await post('/collab', { enabled: true })).status).toBe(404)
    expect((await command({ type: 'snapshot', scope: 'board' })).status).toBe(404)
    process.env.MOI_DEV = '1'
    expect(await (await app.request('/collab')).json()).toEqual({
      enabled: false
    })
    expect((await command({ type: 'snapshot', scope: 'board' })).status).toBe(404)
    expect(await Bun.file(collabReferencePath(directory, workspace.type)).exists()).toBe(false)
    expect(await Bun.file(join(directory, '.moi', 'data', 'collab.sqlite')).exists()).toBe(false)
  })

  test('runtime flag does not install documents, identity or workspace configuration', async () => {
    const referencePath = collabReferencePath(directory, workspace.type)
    const defaultSkillPath = join(dirname(dirname(referencePath)), 'SKILL.md')
    const defaultSkill = '# moi workspace\nExisting workspace instructions.\n'
    await Bun.write(defaultSkillPath, defaultSkill)
    const response = await enable()
    expect(await response.json()).toEqual({
      enabled: true
    })
    expect((await post('/collab', { enabled: true })).status).toBe(404)
    expect(await Bun.file(join(directory, '.moi', '.workspace.json')).exists()).toBe(false)
    expect(await Bun.file(defaultSkillPath).text()).toBe(defaultSkill)
    expect(await Bun.file(referencePath).exists()).toBe(false)
    expect(await Bun.file(join(directory, '.moi', 'collab-env.d.ts')).exists()).toBe(false)
    expect(await Bun.file(join(directory, '.moi', 'data', 'collab.sqlite')).exists()).toBe(false)
  })

  test('HTTP snapshots, mutations and recovery receipts use the same persistent worker', async () => {
    await enable()
    expect(await (await command({ type: 'snapshot', scope: 'board' })).json()).toEqual({
      scope: 'board',
      revision: 0,
      entries: {}
    })
    const edit: CollabCommand = {
      type: 'mutate',
      scope: 'board',
      operationId: 'first',
      operations: [{ type: 'set', key: 'task/title', value: 'First' }]
    }
    expect(await (await command(edit)).json()).toMatchObject({ revision: 1, duplicate: false })
    expect(
      await (
        await command(
          {
            type: 'mutate',
            scope: 'board',
            operationId: 'second',
            operations: [{ type: 'set', key: 'task/done', value: true }]
          },
          'other-agent'
        )
      ).json()
    ).toMatchObject({ revision: 2, duplicate: false })
    expect(await (await command(edit)).json()).toMatchObject({ revision: 1, duplicate: true })
    expect(await (await command({ type: 'snapshot', scope: 'board' })).json()).toEqual({
      scope: 'board',
      revision: 2,
      entries: { 'task/title': 'First', 'task/done': true }
    })
    expect(
      await (
        await command({ type: 'receipts', operationIds: ['first', 'second', 'missing'] })
      ).json()
    ).toEqual([
      { operationId: 'first', status: 'committed', scope: 'board', revision: 1 },
      { operationId: 'second', status: 'unknown' },
      { operationId: 'missing', status: 'unknown' }
    ])
    const mismatch = await command({
      ...edit,
      operations: [{ type: 'set', key: 'task/title', value: 'Changed payload' }]
    })
    expect(mismatch.status).toBe(409)
    expect(await (await command({ type: 'snapshot', scope: 'board' })).json()).toMatchObject({
      revision: 2
    })
  })

  test('rejects commands, actors and public filesystem export', async () => {
    await enable()
    expect(
      (
        await post('/collab/command', {
          actor: { id: 'user', kind: 'admin' },
          command: { type: 'snapshot', scope: 'board' }
        })
      ).status
    ).toBe(400)
    expect((await command({ type: 'export', path: join(directory, 'leak.sqlite') })).status).toBe(
      400
    )
    expect(
      (
        await post('/collab/command', {
          actor: { id: 'agent', kind: 'agent' },
          command: {
            type: 'mutate',
            scope: 'board',
            operationId: 'invalid',
            operations: [{ type: 'increment', key: 'value' }]
          }
        })
      ).status
    ).toBe(400)
    expect(await Bun.file(join(directory, 'leak.sqlite')).exists()).toBe(false)
  })

  test('stopping runtime closes connections and preserves the guide and durable content', async () => {
    await enable()
    const referencePath = collabReferencePath(directory, workspace.type)
    await Bun.write(referencePath, '# Manually installed guide')
    await command({
      type: 'mutate',
      scope: 'board',
      operationId: 'keep',
      operations: [{ type: 'set', key: 'title', value: 'Keep me' }]
    })
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
        version: 1,
        identity: { id: 'anna', name: 'Anna', color: 'blue' }
      })
    )
    await until(() => messages.some(message => message.type === 'welcome'))
    await collabManager.stopWorkspace(directory)
    process.env.MOI_EXPERIMENTAL_COLLAB = '0'
    expect(closed).toBe(true)
    expect(await Bun.file(referencePath).text()).toBe('# Manually installed guide')
    expect(await Bun.file(join(directory, '.moi', 'data', 'collab.sqlite')).exists()).toBe(true)
    expect((await command({ type: 'snapshot', scope: 'board' })).status).toBe(404)
    await enable()
    expect(await (await command({ type: 'snapshot', scope: 'board' })).json()).toMatchObject({
      revision: 1,
      entries: { title: 'Keep me' }
    })
  })
})
