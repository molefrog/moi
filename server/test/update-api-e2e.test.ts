// End-to-end for the update *API*: a real server process, booted from a fake
// bun-style global install, answering real HTTP against a local mock registry
// that counts every request it receives. That count is the whole point — it is
// what proves the server checks on its own schedule instead of once per
// client request, and that no client behaviour (reloads, extra tabs, an
// offline spell, a laptop waking up) can turn into registry traffic.
//
// The last test lets the server update itself for real — `bun install -g` into
// an isolated BUN_INSTALL — and asserts it exits 75, the code the foreground
// CLI and service managers both read as "updated, bring me back".
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { UPDATE_RESTART_EXIT_CODE } from '../update'

const REPO_ROOT = join(import.meta.dir, '..', '..')
const NEW_VERSION = '99.0.0'
const RUNNING_VERSION = '0.5.2'

// Compressed from the shipped hour/five-minutes so the timing is testable.
const TTL_MS = 2_000
const BACKOFF_MS = 600

let home: string
let fakeRoot: string
let registry: ReturnType<typeof Bun.serve>
let tarball: Uint8Array

// How many times the server actually asked the registry for the latest
// version, and a switch to take the registry down under it.
let latestChecks = 0
let registryDown = false

async function buildTarball(): Promise<Uint8Array> {
  const dir = await mkdtemp(join(tmpdir(), 'moi-update-api-pkg-'))
  const pkg = join(dir, 'package')
  await mkdir(join(pkg, 'bin'), { recursive: true })
  await writeFile(
    join(pkg, 'package.json'),
    JSON.stringify({ name: 'moi-computer', version: NEW_VERSION, bin: { moi: 'bin/moi.mjs' } })
  )
  await writeFile(
    join(pkg, 'bin', 'moi.mjs'),
    `#!/usr/bin/env bun\nconsole.log('${NEW_VERSION}')\n`
  )
  const tar = Bun.spawn(['tar', 'czf', '-', '-C', dir, 'package'], {
    stdout: 'pipe',
    stderr: 'ignore'
  })
  const bytes = new Uint8Array(await new Response(tar.stdout).arrayBuffer())
  await tar.exited
  await rm(dir, { recursive: true, force: true })
  return bytes
}

async function freePort(): Promise<number> {
  const probe = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: () => new Response('') })
  const port = probe.port
  probe.stop(true)
  return port
}

beforeAll(async () => {
  home = await mkdtemp(join(tmpdir(), 'moi-update-api-e2e-'))
  fakeRoot = join(home, '.bun', 'install', 'global', 'node_modules', 'moi-computer')

  // A published global install: real server code, a stub dist/index.html so
  // analyzeInstall calls it 'global' (and so the server serves prebuilt assets
  // instead of starting the dev bundler), node_modules symlinked back.
  await mkdir(fakeRoot, { recursive: true })
  // The same tree `files` in package.json publishes — the server imports
  // `../client/index.html` at startup, so a server-side e2e needs `client/`
  // that a CLI-only one can skip.
  for (const entry of [
    'server',
    'client',
    'lib',
    'workspace',
    'package.json',
    'bunfig.toml',
    'tsconfig.json',
    'bin'
  ]) {
    await cp(join(REPO_ROOT, entry), join(fakeRoot, entry), { recursive: true })
  }
  await mkdir(join(fakeRoot, 'dist'), { recursive: true })
  await writeFile(join(fakeRoot, 'dist', 'index.html'), '<html></html>')
  await symlink(join(REPO_ROOT, 'node_modules'), join(fakeRoot, 'node_modules'))

  // The repo may sit on a prerelease, which the update path refuses to touch.
  const pkgPath = join(fakeRoot, 'package.json')
  const pkg = JSON.parse(await Bun.file(pkgPath).text()) as { version: string }
  pkg.version = RUNNING_VERSION
  await writeFile(pkgPath, JSON.stringify(pkg, null, 2))

  // `moi` on PATH, laid out exactly as `bun i -g` does it.
  await mkdir(join(home, '.bun', 'bin'), { recursive: true })
  await symlink(
    join('..', 'install', 'global', 'node_modules', 'moi-computer', 'bin', 'moi.mjs'),
    join(home, '.bun', 'bin', 'moi')
  )

  tarball = await buildTarball()
  const shasum = createHash('sha1').update(tarball).digest('hex')
  const integrity = 'sha512-' + createHash('sha512').update(tarball).digest('base64')

  registry = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch(req) {
      const path = new URL(req.url).pathname
      const dist = {
        tarball: `http://127.0.0.1:${registry.port}/moi-computer/-/moi-computer-${NEW_VERSION}.tgz`,
        shasum,
        integrity
      }
      const manifest = {
        name: 'moi-computer',
        version: NEW_VERSION,
        bin: { moi: 'bin/moi.mjs' },
        dist
      }
      if (path === '/moi-computer/latest') {
        latestChecks += 1
        if (registryDown) return new Response('down', { status: 503 })
        return Response.json(manifest)
      }
      if (path === '/moi-computer') {
        return Response.json({
          name: 'moi-computer',
          'dist-tags': { latest: NEW_VERSION },
          versions: { [NEW_VERSION]: manifest }
        })
      }
      if (path.endsWith('.tgz')) {
        return new Response(tarball, { headers: { 'Content-Type': 'application/octet-stream' } })
      }
      return new Response('not found', { status: 404 })
    }
  })
}, 120_000)

afterAll(async () => {
  registry?.stop(true)
  await rm(home, { recursive: true, force: true })
})

type Server = {
  url: string
  proc: ReturnType<typeof Bun.spawn>
  stop: () => Promise<void>
}

// Boot a real server process from the fake install and wait until it answers.
async function startServer(envExtra: Record<string, string> = {}): Promise<Server> {
  const port = await freePort()
  const controlPort = await freePort()
  const proc = Bun.spawn(['bun', join(fakeRoot, 'server', 'cli.ts'), 'start'], {
    cwd: fakeRoot,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      ...process.env,
      HOME: home,
      MOI_SERVER: '1',
      MOI_DATA_DIR: join(home, 'moi-data'),
      BUN_INSTALL: join(home, '.bun'),
      PATH: `${join(home, '.bun', 'bin')}:${process.env.PATH}`,
      PORT: String(port),
      MOI_CONTROL_PORT: String(controlPort),
      MOI_NPM_REGISTRY: `http://127.0.0.1:${registry.port}`,
      NPM_CONFIG_REGISTRY: `http://127.0.0.1:${registry.port}`,
      MOI_UPDATE_BOOT_GRACE_MS: '0',
      MOI_UPDATE_CACHE_TTL_MS: String(TTL_MS),
      MOI_UPDATE_FAILURE_BACKOFF_MS: String(BACKOFF_MS),
      NO_COLOR: '1',
      ...envExtra
    }
  })

  const url = `http://127.0.0.1:${port}`
  // `/api/config` is a plain read — waiting on `/api/update` would fire the
  // very checks these tests are counting.
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    if (proc.exitCode !== null) throw new Error(`server exited early (${proc.exitCode})`)
    try {
      const res = await fetch(`${url}/api/config`)
      if (res.ok) {
        await res.arrayBuffer()
        return { url, proc, stop: () => stopServer(proc) }
      }
    } catch {}
    await Bun.sleep(100)
  }
  throw new Error('server never came up')
}

async function stopServer(proc: ReturnType<typeof Bun.spawn>): Promise<void> {
  if (proc.exitCode !== null) return
  proc.kill('SIGKILL')
  await proc.exited
}

type Status = { runningVersion: string; availableVersion: string | null }

async function getStatus(url: string): Promise<Status> {
  const res = await fetch(`${url}/api/update`)
  expect(res.status).toBe(200)
  return (await res.json()) as Status
}

describe('update API (e2e)', () => {
  test('the boot grace window keeps the registry untouched', async () => {
    latestChecks = 0
    // A grace longer than this test can run: nothing may reach the registry,
    // however many times a client asks.
    const server = await startServer({ MOI_UPDATE_BOOT_GRACE_MS: String(10 * 60_000) })
    try {
      for (let i = 0; i < 5; i++) {
        expect(await getStatus(server.url)).toEqual({
          runningVersion: RUNNING_VERSION,
          availableVersion: null
        })
      }
      expect(latestChecks).toBe(0)
    } finally {
      await server.stop()
    }
  }, 120_000)

  test('one registry check serves every client until the TTL expires', async () => {
    latestChecks = 0
    const server = await startServer()
    try {
      // Five tabs opening at once — one check between them.
      const first = await Promise.all([
        getStatus(server.url),
        getStatus(server.url),
        getStatus(server.url),
        getStatus(server.url),
        getStatus(server.url)
      ])
      for (const status of first) {
        expect(status).toEqual({
          runningVersion: RUNNING_VERSION,
          availableVersion: NEW_VERSION
        })
      }
      expect(latestChecks).toBe(1)

      // Polling hard inside the TTL costs nothing.
      for (let i = 0; i < 10; i++) await getStatus(server.url)
      expect(latestChecks).toBe(1)

      // Past it, exactly one refresh.
      await Bun.sleep(TTL_MS + 200)
      await Promise.all([getStatus(server.url), getStatus(server.url)])
      expect(latestChecks).toBe(2)
    } finally {
      await server.stop()
    }
  }, 120_000)

  test('an unreachable registry backs off instead of retrying every poll', async () => {
    latestChecks = 0
    registryDown = true
    const server = await startServer()
    try {
      expect(await getStatus(server.url)).toEqual({
        runningVersion: RUNNING_VERSION,
        availableVersion: null
      })
      expect(latestChecks).toBe(1)

      // A client polling through the outage must not become the retry loop.
      for (let i = 0; i < 10; i++) await getStatus(server.url)
      expect(latestChecks).toBe(1)

      // The retry comes on the short backoff — well before the TTL — and the
      // recovered registry is picked up.
      registryDown = false
      await Bun.sleep(BACKOFF_MS + 200)
      expect(await getStatus(server.url)).toEqual({
        runningVersion: RUNNING_VERSION,
        availableVersion: NEW_VERSION
      })
      expect(latestChecks).toBe(2)
    } finally {
      registryDown = false
      await server.stop()
    }
  }, 120_000)

  // Last: this one really replaces the install tree with the stub package.
  test('POST installs the update and exits for the supervisor to restart', async () => {
    latestChecks = 0
    const server = await startServer()
    try {
      expect((await getStatus(server.url)).availableVersion).toBe(NEW_VERSION)

      const res = await fetch(`${server.url}/api/update`, { method: 'POST' })
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ installedVersion: NEW_VERSION })

      // The exit code is the whole restart handshake: `superviseServerUpdates`
      // and the service managers all respawn on it.
      expect(await server.proc.exited).toBe(UPDATE_RESTART_EXIT_CODE)

      // And the bin on PATH really is the new package now.
      const check = Bun.spawn([join(home, '.bun', 'bin', 'moi'), 'version'], {
        stdout: 'pipe',
        env: { ...process.env, PATH: `${join(home, '.bun', 'bin')}:${process.env.PATH}` }
      })
      expect((await new Response(check.stdout).text()).trim()).toBe(NEW_VERSION)
      await check.exited
    } finally {
      await server.stop()
    }
  }, 180_000)
})
