import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  AcpRpcError,
  getAcpClient,
  getAcpProcessInfo,
  killAcpWorkspace,
  killAllAcpClients,
  peekAcpClient,
  releaseAcpClient,
  type AcpClient,
  type AcpSpawnSpec
} from './client'

// Use an actual child and pipes so initialization, shutdown, malformed stdout,
// and request failure exercise the same transport used by installed providers.
const AGENT_SOURCE = `
const { writeFileSync } = require('node:fs')
const send = value => process.stdout.write(JSON.stringify(value) + '\\n')
if (process.env.STARTED_PATH) writeFileSync(process.env.STARTED_PATH, String(process.pid))
if (process.env.DELAY_EXIT) process.on('SIGTERM', () => setTimeout(() => process.exit(0), 100))
setInterval(() => {}, 60_000)
let buffer = ''
process.stdin.on('data', chunk => {
  buffer += chunk
  let nl
  while ((nl = buffer.indexOf('\\n')) >= 0) {
    const line = buffer.slice(0, nl)
    buffer = buffer.slice(nl + 1)
    const msg = JSON.parse(line)
    if (msg.method === 'initialize') {
      if (process.env.HOLD_INIT) continue
      send({ jsonrpc: '2.0', id: msg.id, result: {
        protocolVersion: 1, agentCapabilities: {}, agentInfo: { name: 'fixture', version: '1' }
      } })
    } else if (msg.method === 'fixture/error') {
      send({ jsonrpc: '2.0', id: msg.id, error: {
        code: -32601, message: 'Unsupported session method', data: { provider: { reason: 'missing' } }
      } })
    } else if (msg.method === 'fixture/malformed') {
      process.stdout.write('not json\\nnull\\n42\\n"text"\\ntrue\\n[]\\n')
      send({ jsonrpc: '2.0', method: 'session/update', params: 42 })
      send({ jsonrpc: '2.0', method: 'session/update', params: { marker: 'valid' } })
      send({ jsonrpc: '2.0', id: msg.id, result: { ok: true } })
    } else if (msg.method === 'fixture/exit') {
      process.exit(0)
    } else if (msg.method !== 'session/prompt' && msg.id !== undefined) {
      send({ jsonrpc: '2.0', id: msg.id, result: { pid: process.pid } })
    }
  }
})
`

const workspaces: string[] = []
const owned: AcpClient[] = []

async function spec(overrides: Partial<AcpSpawnSpec> = {}): Promise<AcpSpawnSpec> {
  const workspacePath = await mkdtemp(join(tmpdir(), 'moi-acp-client-test-'))
  workspaces.push(workspacePath)
  return {
    provider: 'fixture',
    command: process.execPath,
    args: ['-e', AGENT_SOURCE],
    workspacePath,
    ...overrides
  }
}

async function start(spawn: AcpSpawnSpec): Promise<AcpClient> {
  const client = await getAcpClient(spawn)
  owned.push(client)
  return client
}

async function waitFor(check: () => boolean | Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 3_000
  while (!(await check())) {
    if (Date.now() >= deadline) throw new Error('Timed out waiting for fixture lifecycle')
    await Bun.sleep(5)
  }
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

afterEach(async () => {
  for (const client of owned.splice(0)) releaseAcpClient(client)
  for (const workspacePath of workspaces.splice(0)) {
    killAcpWorkspace(workspacePath)
    await rm(workspacePath, { recursive: true, force: true })
  }
})

describe('ACP process ownership', () => {
  test('shares an identical workspace spec while isolating providers, scopes, args, and env', async () => {
    const base = await spec({ env: { FIRST: 'one', SECOND: 'two' } })
    const [shared, same] = await Promise.all([
      start(base),
      start({ ...base, env: { SECOND: 'two', FIRST: 'one' } })
    ])
    expect(same).toBe(shared)
    const clients = await Promise.all([
      start({ ...base, provider: 'other-provider' }),
      start({ ...base, scope: 'session-a' }),
      start({ ...base, scope: 'discovery' }),
      start({ ...base, env: { FIRST: 'changed', SECOND: 'two' } }),
      start({ ...base, args: [...base.args, 'another-profile'] })
    ])
    expect(new Set([shared, ...clients]).size).toBe(6)
    expect(await peekAcpClient(base.workspacePath, 'fixture')).toBe(shared)
    expect(await peekAcpClient(base.workspacePath, 'other-provider')).toBe(clients[0])
    expect(await peekAcpClient(base.workspacePath, 'missing')).toBeNull()
    const otherInfo = await getAcpProcessInfo(base.workspacePath, base.command, 'other-provider')
    expect(otherInfo.running).toBe(true)
    expect(otherInfo.pid).toBe((await clients[0]!.rpc<{ pid: number }>('fixture/info')).pid)
    expect(await getAcpProcessInfo(base.workspacePath, base.command, 'missing')).toEqual({
      running: false,
      binary: base.command
    })
  })

  test('release stops only its concrete process and late exit cannot remove a replacement', async () => {
    const base = await spec({ env: { DELAY_EXIT: '1' }, scope: 'session-a' })
    const old = await start(base)
    const sibling = await start({ ...base, scope: 'session-b' })
    const pid = (await old.rpc<{ pid: number }>('fixture/info')).pid
    const prompt = old.rpc('session/prompt').catch(error => error)
    releaseAcpClient(old)
    expect(await prompt).toBeInstanceOf(Error)
    expect(old.isAlive()).toBe(false)
    expect(sibling.isAlive()).toBe(true)
    const replacement = await start(base)
    await waitFor(() => !processAlive(pid))
    releaseAcpClient(old)
    expect(await getAcpClient(base)).toBe(replacement)
    expect(replacement.isAlive()).toBe(true)
  })

  test('an unexpected exit rejects unbounded prompts and permits a fresh process', async () => {
    const base = await spec()
    const old = await start(base)
    const prompt = old.rpc('session/prompt').catch(error => error)
    old.notify('fixture/exit')
    expect(await prompt).toBeInstanceOf(Error)
    expect(await peekAcpClient(base.workspacePath)).toBeNull()
    const replacement = await start(base)
    expect(replacement).not.toBe(old)
    expect(replacement.isAlive()).toBe(true)
  })

  test('workspace shutdown stops every provider and scope, and global shutdown stops the rest', async () => {
    const base = await spec()
    const unrelated = await start(await spec())
    const clients = await Promise.all([
      start(base),
      start({ ...base, provider: 'other' }),
      start({ ...base, scope: 'session-a' })
    ])
    killAcpWorkspace(base.workspacePath)
    expect(clients.every(client => !client.isAlive())).toBe(true)
    expect(unrelated.isAlive()).toBe(true)
    killAllAcpClients()
    expect(unrelated.isAlive()).toBe(false)
  })

  test('workspace shutdown interrupts a handshake without orphaning its process', async () => {
    const base = await spec()
    const startedPath = join(base.workspacePath, 'started')
    const starting = getAcpClient({
      ...base,
      env: { HOLD_INIT: '1', STARTED_PATH: startedPath }
    }).catch(error => error)
    await waitFor(() => Bun.file(startedPath).exists())
    const pid = Number(await Bun.file(startedPath).text())
    killAcpWorkspace(base.workspacePath)
    expect(await starting).toBeInstanceOf(Error)
    await waitFor(() => !processAlive(pid))
    expect(await peekAcpClient(base.workspacePath)).toBeNull()
  })

  test('provider shutdown filters leave other providers in the same workspace running', async () => {
    const base = await spec()
    const fixture = await start(base)
    const other = await start({ ...base, provider: 'other' })
    const elsewhere = await start(await spec({ provider: 'other' }))
    killAcpWorkspace(base.workspacePath, 'fixture')
    expect(fixture.isAlive()).toBe(false)
    expect(other.isAlive()).toBe(true)
    expect(elsewhere.isAlive()).toBe(true)
    killAllAcpClients('other')
    expect(other.isAlive()).toBe(false)
    expect(elsewhere.isAlive()).toBe(false)
  })

  test('shutdown before env resolution prevents the process from spawning', async () => {
    const base = await spec()
    const startedPath = join(base.workspacePath, 'started')
    const starting = getAcpClient({ ...base, env: { STARTED_PATH: startedPath } }).catch(
      error => error
    )
    killAcpWorkspace(base.workspacePath)
    expect(await starting).toBeInstanceOf(Error)
    expect(await Bun.file(startedPath).exists()).toBe(false)
  })
})

describe('ACP JSON-RPC framing', () => {
  test('preserves a typed error with nested provider data', async () => {
    const client = await start(await spec())
    const error = await client.rpc('fixture/error').catch(error => error)
    expect(error).toBeInstanceOf(AcpRpcError)
    if (!(error instanceof AcpRpcError)) throw new Error('Expected a typed RPC error')
    expect(error.code).toBe(-32601)
    expect(error.message).toBe('Unsupported session method')
    expect(error.data).toEqual({ provider: { reason: 'missing' } })
    expect(client.isAlive()).toBe(true)
  })

  test('ignores malformed JSON/envelopes and continues delivering valid messages', async () => {
    const client = await start(await spec())
    const received: Record<string, unknown>[] = []
    client.onNotification((method, params) => {
      if (method === 'session/update') received.push(params)
    })
    expect(await client.rpc<{ ok: boolean }>('fixture/malformed')).toEqual({ ok: true })
    expect(received).toEqual([{ marker: 'valid' }])
    expect(client.isAlive()).toBe(true)
  })

  for (const operation of ['write', 'flush'] as const) {
    test(`a failed stdin ${operation} rejects pending calls and terminates the process`, async () => {
      const spawnSpec = await spec()
      const spawned = spyOn(Bun, 'spawn')
      let client: AcpClient
      let proc: ReturnType<typeof Bun.spawn> | undefined
      try {
        client = await start(spawnSpec)
        proc = spawned.mock.results.find(result => result.type === 'return')?.value
      } finally {
        spawned.mockRestore()
      }
      if (!proc?.stdin || typeof proc.stdin === 'number')
        throw new Error('Expected a piped child stdin')
      const pid = (await client.rpc<{ pid: number }>('fixture/info')).pid
      const prompt = client.rpc('session/prompt').catch(error => error)
      // Ensure the unbounded prompt reached the real child before its writer
      // fails. Closing fd 0 in a Bun child is not portable: Linux Bun 1.3
      // retains that stdin pipe even after closeSync/destroy, so no EPIPE occurs.
      await client.rpc('fixture/info')
      const brokenPipe = new Error(`EPIPE: fixture ${operation} failed`)
      const sink =
        operation === 'write'
          ? spyOn(proc.stdin, 'write').mockImplementation(() => {
              throw brokenPipe
            })
          : spyOn(proc.stdin, 'flush').mockImplementation(() => Promise.reject(brokenPipe))
      try {
        const failure = client.rpc('fixture/info').catch(error => error)
        const error = await failure
        expect(error).toBeInstanceOf(Error)
        if (!(error instanceof Error)) throw new Error('Expected a transport error')
        expect(error.message).toContain(brokenPipe.message)
        expect(await prompt).toBe(error)
        expect(client.isAlive()).toBe(false)
        await waitFor(() => !processAlive(pid))
      } finally {
        sink.mockRestore()
      }
    })
  }
})
