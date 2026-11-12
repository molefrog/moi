import { afterAll, beforeAll, expect, test } from 'bun:test'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createOperationsHandler } from './server'
import { initializeRemoteWorkspaceConfig } from '../workspaces/layout'

let root: string, local: string, data: string, server: ReturnType<typeof Bun.serve>
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'moi-ops-cli-'))
  local = join(root, 'local')
  data = join(root, 'data')
  const host = join(root, 'host')
  await Promise.all([mkdir(local), mkdir(data), mkdir(host)])
  await initializeRemoteWorkspaceConfig(local, { user_id: 'owner', workspace_id: 'test' })
  const ops = createOperationsHandler(async id =>
    id === 'test' ? { id, path: host, addedAt: '' } : null
  )
  server = Bun.serve({
    port: 0,
    async fetch(request) {
      expect(request.headers.get('authorization')).toStartWith('Bearer ')
      const url = new URL(request.url)
      url.pathname = url.pathname.replace(
        '/cloud/api/workspaces/owner:test/ops',
        '/workspaces/test'
      )
      return ops(new Request(url, request))
    }
  })
  const url = `http://localhost:${server.port}/cloud`
  await Bun.write(join(data, 'config.json'), JSON.stringify({ remote: { url } }))
  const payload = Buffer.from(
    JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })
  ).toString('base64url')
  await Bun.write(
    join(data, 'remote-auth.json'),
    JSON.stringify({
      url,
      clientId: 'moi-cli',
      accessToken: `e30.${payload}.test`,
      refreshToken: 'test'
    })
  )
})
afterAll(async () => {
  server?.stop(true)
  await rm(root, { recursive: true, force: true })
})
async function cli(args: string[], input?: string) {
  const child = Bun.spawn(
    [process.execPath, join(import.meta.dir, '../cli.ts'), 'remote', ...args],
    {
      cwd: local,
      env: { ...process.env, MOI_DATA_DIR: data, NO_COLOR: '1' },
      stdin: input === undefined ? 'ignore' : new TextEncoder().encode(input),
      stdout: 'pipe',
      stderr: 'pipe'
    }
  )
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited
  ])
  return { stdout, stderr, code }
}
test('standalone CLI writes, reads and patches without a local Moi server', async () => {
  expect((await cli(['write', 'hello.txt', 'hello\n', '--json'])).code).toBe(0)
  expect(await cli(['read', 'hello.txt'])).toEqual({ code: 0, stdout: 'hello\n', stderr: '' })
  const patch = await cli(['patch', 'hello.txt', '--json'], '@@ -1 +1 @@\n-hello\n+world\n')
  expect(patch.code).toBe(0)
  expect((await cli(['read', 'hello.txt'])).stdout).toBe('world\n')
})
test('standalone CLI round trips binary files', async () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32_768))
  await Bun.write(join(local, 'original.bin'), bytes)
  expect((await cli(['file-upload', 'original.bin', 'binary.bin', '--json'])).code).toBe(0)
  expect((await cli(['file-download', 'binary.bin', 'copy.bin', '--json'])).code).toBe(0)
  expect(new Uint8Array(await Bun.file(join(local, 'copy.bin')).arrayBuffer())).toEqual(bytes)
})
test('CLI relays stdout, stderr, JSON events, nonzero exit and commands', async () => {
  expect(await cli(['exec', 'printf out; printf err >&2; exit 9'])).toEqual({
    code: 9,
    stdout: 'out',
    stderr: 'err'
  })
  const events = await cli(['exec', 'printf yes', '--json'])
  expect(events.code).toBe(0)
  expect(events.stdout).toContain('"type":"exit","code":0')
  const check = await cli(['check', '--json'])
  expect(check.stdout).toContain('"exitCode"')
  expect((await cli(['read', '../outside'])).code).toBe(1)
})
