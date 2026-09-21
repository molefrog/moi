import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { CollabClientMessage, CollabServerMessage } from '@/lib/collab/types'

import { CollabManager, type CollabSocket } from './manager'

const managers: CollabManager[] = []
const directories: string[] = []
const servers: Bun.Server<{ workspacePath: string }>[] = []
const sockets: WebSocket[] = []

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.close()
  for (const server of servers.splice(0)) server.stop(true)
  await Promise.all(managers.splice(0).map(manager => manager.shutdown()))
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

function directory() {
  const path = mkdtempSync(join(tmpdir(), 'moi-collab-runtime-'))
  directories.push(path)
  return path
}

function manager(options: ConstructorParameters<typeof CollabManager>[0] = {}) {
  const instance = new CollabManager({ enabled: async () => true, ...options })
  managers.push(instance)
  return instance
}

async function until(predicate: () => boolean, timeout = 5000) {
  const deadline = Date.now() + timeout
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('Timed out waiting for collab event')
    await Bun.sleep(10)
  }
}

function serve(runtime: CollabManager, workspacePath: string, dropAcknowledgments = false) {
  const connections = new Map<Bun.ServerWebSocket<{ workspacePath: string }>, CollabSocket>()
  const server = Bun.serve<{ workspacePath: string }>({
    port: 0,
    hostname: '127.0.0.1',
    fetch(req, server) {
      return server.upgrade(req, { data: { workspacePath } })
        ? undefined
        : new Response('Upgrade failed', { status: 400 })
    },
    websocket: {
      open(socket) {
        const connection: CollabSocket = {
          send(message) {
            // Simulate a lost acknowledgment after the worker has committed its transaction.
            if (dropAcknowledgments && (JSON.parse(message) as CollabServerMessage).type === 'ack')
              return 0
            return socket.send(message)
          },
          close: (code, reason) => socket.close(code, reason),
          getBufferedAmount: () => socket.getBufferedAmount()
        }
        connections.set(socket, connection)
        runtime.open(connection, socket.data.workspacePath)
      },
      message(socket, message) {
        const connection = connections.get(socket)
        if (connection) runtime.message(connection, message)
      },
      close(socket) {
        const connection = connections.get(socket)
        if (connection) runtime.close(connection)
        connections.delete(socket)
      }
    }
  })
  servers.push(server)
  return `ws://127.0.0.1:${server.port}`
}

async function connect(url: string, id: string) {
  const socket = new WebSocket(url)
  sockets.push(socket)
  const messages: CollabServerMessage[] = []
  socket.onmessage = event => messages.push(JSON.parse(String(event.data)) as CollabServerMessage)
  const send = (message: CollabClientMessage) => socket.send(JSON.stringify(message))
  await until(() => socket.readyState === WebSocket.OPEN)
  send({ type: 'join', version: 1, identity: { id, name: id, color: 'blue' } })
  await until(() => messages.some(message => message.type === 'welcome'))
  return { socket, messages, send }
}

describe('collab process and socket integration', () => {
  test('simultaneous requests start one worker and different workspaces keep separate databases', async () => {
    const runtime = manager()
    const first = directory()
    const second = directory()
    const actor = { id: 'agent', kind: 'agent' as const }
    await Promise.all(
      ['title', 'done'].map(key =>
        runtime.call(first, actor, {
          type: 'mutate',
          scope: 'board',
          operationId: key,
          operations: [{ type: 'set', key, value: key }]
        })
      )
    )
    expect(runtime.debugSnapshot()).toHaveLength(1)
    expect(await runtime.call(first, actor, { type: 'snapshot', scope: 'board' })).toMatchObject({
      revision: 2,
      entries: { title: 'title', done: 'done' }
    })
    expect(await runtime.call(second, actor, { type: 'snapshot', scope: 'board' })).toEqual({
      scope: 'board',
      revision: 0,
      entries: {}
    })
    expect(runtime.debugSnapshot()).toHaveLength(2)
  })

  test('real sockets converge and closing a tab removes presence', async () => {
    const runtime = manager()
    const path = directory()
    const url = serve(runtime, path)
    const a = await connect(url, 'anna')
    const b = await connect(url, 'boris')
    for (const [client, subscriptionId] of [
      [a, 'a'],
      [b, 'b']
    ] as const) {
      client.send({ type: 'subscribe', scope: 'board', subscriptionId })
      await until(() => client.messages.some(message => message.type === 'snapshot'))
    }
    a.send({
      type: 'mutate',
      scope: 'board',
      operationId: 'edit',
      operations: [{ type: 'set', key: 'done', value: true }]
    })
    await until(() => a.messages.some(message => message.type === 'ack'))
    await until(() =>
      b.messages.some(message => message.type === 'update' && message.revision === 1)
    )
    expect(runtime.debugSnapshot()[0]?.connections).toBe(2)
    a.socket.close()
    await until(() =>
      b.messages.some(
        message => message.type === 'participants' && message.participants.length === 1
      )
    )
    expect(runtime.debugSnapshot()[0]?.connections).toBe(1)
  })

  test('a lost acknowledgment and worker death recover committed content through receipts', async () => {
    const runtime = manager()
    const path = directory()
    const url = serve(runtime, path, true)
    const client = await connect(url, 'anna')
    client.send({
      type: 'mutate',
      scope: 'board',
      operationId: 'committed',
      operations: [{ type: 'set', key: 'title', value: 'Survives' }]
    })
    await until(() => client.socket.readyState === WebSocket.CLOSED)
    expect(client.messages.some(message => message.type === 'ack')).toBe(false)
    const pid = runtime.debugSnapshot()[0]?.pid
    if (!pid) throw new Error('Missing worker process')
    process.kill(pid, 'SIGKILL')
    await until(() => client.socket.readyState === WebSocket.CLOSED)
    await until(() => runtime.debugSnapshot().length === 0)
    await Bun.sleep(300)
    const replacement = await connect(url, 'anna')
    replacement.send({ type: 'subscribe', scope: 'board', subscriptionId: 'fresh' })
    replacement.send({
      type: 'receipts',
      requestId: 'recover',
      operationIds: ['committed', 'not-sent']
    })
    await until(() => replacement.messages.some(message => message.type === 'receipts'))
    expect(replacement.messages.find(message => message.type === 'snapshot')).toMatchObject({
      revision: 1,
      entries: { title: 'Survives' }
    })
    expect(replacement.messages.find(message => message.type === 'receipts')).toMatchObject({
      receipts: [
        { operationId: 'committed', status: 'committed', scope: 'board', revision: 1 },
        { operationId: 'not-sent', status: 'unknown' }
      ]
    })
  })

  test('idle workers stop but a connected browser keeps its worker alive', async () => {
    const runtime = manager({ idleTimeoutMs: 30 })
    const path = directory()
    const client = await connect(serve(runtime, path), 'anna')
    await Bun.sleep(80)
    expect(runtime.debugSnapshot()).toHaveLength(1)
    client.socket.close()
    await until(() => runtime.debugSnapshot().length === 0)
  })

  test('a child that never becomes ready rejects startup and is reaped', async () => {
    const workerPath = join(directory(), 'stalled.ts')
    await Bun.write(workerPath, 'process.on("message", () => {}); setInterval(() => {}, 1000)')
    const runtime = manager({ workerPath, startupTimeoutMs: 30 })
    await expect(
      runtime.call(
        directory(),
        { id: 'test', kind: 'system' },
        { type: 'snapshot', scope: 'board' }
      )
    ).rejects.toThrow('did not start')
    await until(() => runtime.debugSnapshot().length === 0)
  })

  test('parent process death does not leave an orphan collab worker', async () => {
    const root = directory()
    const parentPath = join(root, 'parent.ts')
    await Bun.write(
      parentPath,
      `
      import { CollabManager } from ${JSON.stringify(join(import.meta.dir, 'manager.ts'))};
      const runtime = new CollabManager({ enabled: async () => true });
      await runtime.call(${JSON.stringify(root)}, { id: 'test', kind: 'system' }, { type: 'snapshot', scope: 'board' });
      console.log(runtime.debugSnapshot()[0].pid);
      process.exit(0);
    `
    )
    const parent = Bun.spawn([process.execPath, parentPath], { stdout: 'pipe', stderr: 'inherit' })
    const pid = Number((await new Response(parent.stdout).text()).trim())
    expect(await parent.exited).toBe(0)
    expect(Number.isInteger(pid) && pid > 0).toBe(true)
    try {
      await until(() => {
        try {
          process.kill(pid, 0)
          return false
        } catch {
          return true
        }
      })
    } finally {
      try {
        process.kill(pid, 'SIGKILL')
      } catch {}
    }
  })
})
