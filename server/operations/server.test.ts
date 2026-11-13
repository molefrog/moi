import { afterAll, beforeAll, expect, test } from 'bun:test'
import { mkdtemp, mkdir, rm, symlink, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createOperationsHandler, startOperations, stopOperations } from './server'
import { applyUnifiedPatch, workspaceFile } from './files'
import { commandArguments } from './commands'

let root: string
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'moi-ops-'))
})
afterAll(async () => {
  stopOperations()
  await rm(root, { recursive: true, force: true })
})
const handler = createOperationsHandler(async id =>
  id === 'test' ? { id, path: root, addedAt: '' } : null
)
const request = (suffix: string, init?: RequestInit) =>
  handler(new Request(`http://local/workspaces/test/${suffix}`, init))

test('binary upload, download, HEAD, overwrite and empty files', async () => {
  const bytes = crypto.getRandomValues(new Uint8Array(50_000))
  expect((await request('files/sub/file.bin', { method: 'PUT', body: bytes })).status).toBe(200)
  expect(new Uint8Array(await (await request('files/sub/file.bin')).arrayBuffer())).toEqual(bytes)
  const head = await request('files/sub/file.bin', { method: 'HEAD' })
  expect(head.headers.get('content-length')).toBe('50000')
  expect(await head.text()).toBe('')
  expect((await request('files/sub/file.bin', { method: 'PUT', body: '' })).status).toBe(200)
  expect(await (await request('files/sub/file.bin')).text()).toBe('')
  expect((await request('files/sub/file.bin', { method: 'PUT' })).status).toBe(200)
})
test('patches match exactly and conflicts preserve original', async () => {
  await request('files/patch.txt', { method: 'PUT', body: 'one\ntwo\n' })
  const patch = '@@ -1,2 +1,2 @@\n one\n-two\n+three\n'
  const init = { method: 'PATCH', body: JSON.stringify({ patch }) }
  expect((await request('files/patch.txt', init)).status).toBe(200)
  expect((await request('files/patch.txt', init)).status).toBe(409)
  expect(await (await request('files/patch.txt')).text()).toBe('one\nthree\n')
  expect(applyUnifiedPatch('', '@@ -0,0 +1 @@\n+hello\n')).toBe('hello\n')
  expect(
    applyUnifiedPatch(
      'a',
      '@@ -1 +1 @@\n-a\n\\ No newline at end of file\n+b\n\\ No newline at end of file\n'
    )
  ).toBe('b')
})
test('traversal, symlinks, directories and unknown workspaces are rejected', async () => {
  await symlink(tmpdir(), join(root, 'outside'))
  await mkdir(join(root, 'directory'))
  for (const path of ['../escape', '/tmp/escape', 'outside/test', 'directory'])
    await expect(workspaceFile(root, path)).rejects.toThrow()
  expect((await request('files/%2e%2e%2fescape')).status).toBe(400)
  expect(
    (
      await handler(
        new Request('http://local/workspaces/nope/exec', {
          method: 'POST',
          body: '{"command":"true"}'
        })
      )
    ).status
  ).toBe(404)
  expect(
    (await handler(new Request('http://local/api/workspaces/test/exec', { method: 'POST' }))).status
  ).toBe(404)
})
test('exec streams separate output before completion and preserves failure code', async () => {
  const response = await request('exec', {
    method: 'POST',
    body: JSON.stringify({ command: 'printf ready; sleep 0.3; printf error >&2; exit 7' })
  })
  const reader = response.body!.getReader()
  const first = new TextDecoder().decode((await reader.read()).value)
  expect(JSON.parse(first)).toEqual({ type: 'stdout', data: 'ready' })
  let remaining = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    remaining += new TextDecoder().decode(value)
  }
  const events = remaining
    .trim()
    .split('\n')
    .map(line => JSON.parse(line))
  expect(events).toContainEqual({ type: 'stderr', data: 'error' })
  expect(events.at(-1)).toEqual({ type: 'exit', code: 7 })
})
test('cancelling exec kills shell descendants', async () => {
  const response = await request('exec', {
    method: 'POST',
    body: JSON.stringify({ command: 'sleep 1; touch should-not-exist' })
  })
  await response.body!.cancel()
  await Bun.sleep(1200)
  expect(await Bun.file(join(root, 'should-not-exist')).exists()).toBe(false)
})
test('commands are allowlisted; workspace cannot be overridden', async () => {
  for (const command of ['start', 'stop', 'navigate', 'remote', 'install'])
    expect(
      (await request('commands', { method: 'POST', body: JSON.stringify({ command, args: [] }) }))
        .status
    ).toBe(400)
  expect(() => commandArguments('debug', ['other'])).toThrow()
  expect(() => commandArguments('bundle', ['--dir=/tmp'])).toThrow()
  expect(commandArguments('views', ['set', 'view-id', '--title', 'Test'])).toEqual([
    'views',
    'set',
    'view-id',
    '.',
    '--title',
    'Test'
  ])
  const response = await request('commands', {
    method: 'POST',
    body: JSON.stringify({ command: 'check', args: [] })
  })
  const result = await response.json()
  expect(result.exitCode).toBeNumber()
  expect(result.stdout).toBeString()
  expect(result.stderr).toBeString()
})
test('operations socket permissions match gateway group access', async () => {
  const socket = join(root, 'ops.sock')
  const server = await startOperations(socket)
  try {
    expect((await stat(socket)).mode & 0o777).toBe(0o660)
  } finally {
    server.stop(true)
  }
})

test('explicit cancellation stops only the matching caller and prevents a late start', async () => {
  const id = crypto.randomUUID()
  const start = await request('exec', {
    method: 'POST',
    headers: { 'x-moi-user-id': 'agent-a' },
    body: JSON.stringify({
      id,
      command: 'printf ready; sleep 0.1; printf alive; sleep 1; touch cancel-should-not-exist'
    })
  })
  const reader = start.body!.getReader()
  await reader.read()
  await request('exec', {
    method: 'POST',
    headers: { 'x-moi-user-id': 'agent-b' },
    body: JSON.stringify({ cancel: id })
  })
  expect(new TextDecoder().decode((await reader.read()).value)).toContain('alive')
  await request('exec', {
    method: 'POST',
    headers: { 'x-moi-user-id': 'agent-a' },
    body: JSON.stringify({ cancel: id })
  })
  while (!(await reader.read()).done) {
    // Drain output until the cancelled process closes its stream.
  }
  await Bun.sleep(1100)
  expect(await Bun.file(join(root, 'cancel-should-not-exist')).exists()).toBe(false)
  expect(
    (
      await request('exec', {
        method: 'POST',
        headers: { 'x-moi-user-id': 'agent-a' },
        body: JSON.stringify({ id, command: 'true' })
      })
    ).status
  ).toBe(409)
})
