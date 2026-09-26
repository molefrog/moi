import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { COLLAB_MAX_MESSAGE_BYTES } from '@/lib/collab/protocol'
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

function serve(runtime: CollabManager, workspacePath: string) {
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
          send: message => socket.send(message),
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
  send({ type: 'join', version: 2, identity: { id, name: id, color: 'blue' } })
  await until(() => messages.some(message => message.type === 'welcome'))
  return { socket, messages, send }
}

function latestParticipants(messages: CollabServerMessage[]) {
  const message = messages.findLast(item => item.type === 'participants' || item.type === 'welcome')
  if (message?.type !== 'participants' && message?.type !== 'welcome')
    throw new Error('Missing participants')
  return message
}

function localSocket() {
  const messages: CollabServerMessage[] = []
  let reason: string | undefined
  let buffered = 0
  const socket: CollabSocket = {
    send(message) {
      messages.push(JSON.parse(message) as CollabServerMessage)
      return message.length
    },
    close(_code, value) {
      reason = value
    },
    getBufferedAmount: () => buffered
  }
  return {
    socket,
    messages,
    get reason() {
      return reason
    },
    set buffered(value: number) {
      buffered = value
    }
  }
}

function joinLocal(runtime: CollabManager, socket: CollabSocket) {
  runtime.message(
    socket,
    JSON.stringify({
      type: 'join',
      version: 2,
      identity: { id: 'anna', name: 'Anna', color: 'blue' }
    })
  )
}

describe('collab process and socket integration', () => {
  test('simultaneous connections share one worker and workspaces isolate presence and users', async () => {
    const runtime = manager()
    const first = directory()
    const second = directory()
    const firstUrl = serve(runtime, first)
    const [a, b] = await Promise.all([connect(firstUrl, 'anna'), connect(firstUrl, 'boris')])
    await until(() => latestParticipants(a.messages).participants.length === 2)
    expect(runtime.debugSnapshot()).toHaveLength(1)
    expect(
      latestParticipants(a.messages)
        .users.map(user => user.id)
        .sort()
    ).toEqual(['anna', 'boris'])
    const c = await connect(serve(runtime, second), 'carla')
    expect(latestParticipants(c.messages).participants.map(user => user.userId)).toEqual(['carla'])
    expect(
      latestParticipants(b.messages)
        .users.map(user => user.id)
        .sort()
    ).toEqual(['anna', 'boris'])
    expect(runtime.debugSnapshot()).toHaveLength(2)
    for (const path of [first, second]) {
      expect(await Bun.file(join(path, '.moi', 'data', 'collab.sqlite')).exists()).toBe(false)
    }
  })

  test('real sockets share presence and closing a tab removes its presence and user profile', async () => {
    const runtime = manager()
    const url = serve(runtime, directory())
    const a = await connect(url, 'anna')
    const b = await connect(url, 'boris')
    a.send({
      type: 'presence:set',
      registrationId: 'focus',
      surface: 'view:board',
      channel: 'focus',
      value: { target: 'todo:42' }
    })
    await until(() =>
      latestParticipants(b.messages).participants.some(
        item => item.userId === 'anna' && item.presence.length === 1
      )
    )
    a.send({ type: 'location', location: null })
    await until(() =>
      latestParticipants(b.messages).participants.some(
        item => item.userId === 'anna' && item.location === null
      )
    )
    expect(runtime.debugSnapshot()[0]?.connections).toBe(2)
    a.socket.close()
    await until(() => latestParticipants(b.messages).participants.length === 1)
    expect(latestParticipants(b.messages).users.map(user => user.id)).toEqual(['boris'])
    expect(runtime.debugSnapshot()[0]?.connections).toBe(1)
  })

  test('worker death closes sockets and reconnect starts an empty ephemeral room', async () => {
    const runtime = manager()
    const url = serve(runtime, directory())
    const client = await connect(url, 'anna')
    client.send({
      type: 'presence:set',
      registrationId: 'cursor',
      surface: 'view:board',
      channel: 'cursor',
      value: { x: 12 }
    })
    await until(() => latestParticipants(client.messages).participants[0]?.presence.length === 1)
    const previous = runtime.debugSnapshot()[0]
    if (!previous) throw new Error('Missing worker process')
    process.kill(previous.pid, 'SIGKILL')
    await until(
      () => client.socket.readyState === WebSocket.CLOSED && runtime.debugSnapshot().length === 0
    )
    await Bun.sleep(300)
    const replacement = await connect(url, 'boris')
    expect(runtime.debugSnapshot()[0]?.generation).not.toBe(previous.generation)
    expect(latestParticipants(replacement.messages).users.map(user => user.id)).toEqual(['boris'])
    expect(latestParticipants(replacement.messages).participants[0]?.presence).toEqual([])
  })

  test('idle workers stop but a connected browser keeps its worker alive', async () => {
    const runtime = manager({ idleTimeoutMs: 30 })
    const client = await connect(serve(runtime, directory()), 'anna')
    await Bun.sleep(80)
    expect(runtime.debugSnapshot()).toHaveLength(1)
    client.socket.close()
    await until(() => runtime.debugSnapshot().length === 0)
  })

  test('malformed, old-version and removed storage messages fail without reaching the room', async () => {
    const runtime = manager()
    const client = await connect(serve(runtime, directory()), 'anna')
    const invalid = [
      '{',
      JSON.stringify({
        type: 'join',
        version: 1,
        identity: { id: 'old', name: 'Old', color: 'red' }
      }),
      JSON.stringify({
        type: 'mutate',
        scope: 'board',
        operationId: 'edit',
        operations: [{ type: 'set', key: 'title', value: 'Hello' }]
      })
    ]
    for (const raw of invalid) client.socket.send(raw)
    await until(
      () => client.messages.filter(item => item.type === 'error').length === invalid.length
    )
    expect(
      client.messages
        .filter(item => item.type === 'error')
        .every(item => item.code === 'invalid_message')
    ).toBe(true)
    expect(latestParticipants(client.messages).participants.map(item => item.userId)).toEqual([
      'anna'
    ])
    client.send({ type: 'ping' })
    await until(() => client.messages.some(item => item.type === 'pong'))
  })

  test('oversized input disconnects the sender and clears its presence', async () => {
    const runtime = manager()
    const url = serve(runtime, directory())
    const a = await connect(url, 'anna')
    const b = await connect(url, 'boris')
    a.socket.send('x'.repeat(COLLAB_MAX_MESSAGE_BYTES + 1))
    await until(() => a.socket.readyState === WebSocket.CLOSED)
    await until(() => latestParticipants(b.messages).users.length === 1)
    expect(latestParticipants(b.messages).users[0]?.id).toBe('boris')
  })

  test('backpressure drops transient snapshots and disconnects when heartbeat cannot be delivered', async () => {
    const runtime = manager()
    const client = localSocket()
    runtime.open(client.socket, directory())
    joinLocal(runtime, client.socket)
    await until(() => client.messages.some(item => item.type === 'welcome'))
    const count = client.messages.length
    client.buffered = 1024 * 1024 + 1
    runtime.message(
      client.socket,
      JSON.stringify({ type: 'location', location: { page: 'view:board' } })
    )
    await Bun.sleep(100)
    expect(client.messages).toHaveLength(count)
    expect(client.reason).toBeUndefined()
    runtime.message(client.socket, JSON.stringify({ type: 'ping' }))
    await until(() => client.reason !== undefined)
    expect(client.reason).toContain('fresh connection')
    expect(runtime.debugSnapshot()[0]?.connections).toBe(0)
  })

  test('heartbeats keep active sockets live and silent peers time out', async () => {
    const runtime = manager({ livenessTimeoutMs: 500 })
    const url = serve(runtime, directory())
    const active = await connect(url, 'anna')
    const silent = await connect(url, 'boris')
    const heartbeat = setInterval(() => active.send({ type: 'ping' }), 100)
    try {
      await until(() => silent.socket.readyState === WebSocket.CLOSED, 6500)
      expect(active.socket.readyState).toBe(WebSocket.OPEN)
      await until(() => latestParticipants(active.messages).users.length === 1)
      expect(latestParticipants(active.messages).users[0]?.id).toBe('anna')
    } finally {
      clearInterval(heartbeat)
    }
  }, 10_000)

  test('a child that never becomes ready closes its clients and is reaped', async () => {
    const workerPath = join(directory(), 'stalled.ts')
    await Bun.write(workerPath, 'process.on("message", () => {}); setInterval(() => {}, 1000)')
    const runtime = manager({ workerPath, startupTimeoutMs: 30 })
    const client = localSocket()
    runtime.open(client.socket, directory())
    joinLocal(runtime, client.socket)
    await until(() => client.reason !== undefined)
    expect(client.reason).toContain('startup timed out')
    await until(() => runtime.debugSnapshot().length === 0)
  })

  test('disabled runtime rejects connections without creating a worker', async () => {
    const runtime = manager({ enabled: async () => false })
    const client = localSocket()
    runtime.open(client.socket, directory())
    await until(() => client.reason !== undefined)
    expect(runtime.debugSnapshot()).toEqual([])
    expect(client.messages[0]).toMatchObject({ type: 'error', code: 'unavailable' })
  })

  test('parent process death does not leave an orphan collab worker', async () => {
    const root = directory()
    const parentPath = join(root, 'parent.ts')
    await Bun.write(
      parentPath,
      `
      import { CollabManager } from ${JSON.stringify(join(import.meta.dir, 'manager.ts'))};
      const runtime = new CollabManager({ enabled: async () => true });
      const socket = { send(message) {
        if (JSON.parse(message).type === 'welcome') {
          console.log(runtime.debugSnapshot()[0].pid);
          process.exit(0);
        }
        return message.length;
      }, close() {} };
      runtime.open(socket, ${JSON.stringify(root)});
      runtime.message(socket, JSON.stringify({ type: 'join', version: 2, identity: { id: 'test', name: 'Test', color: 'blue' } }));
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
