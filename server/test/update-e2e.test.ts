// End-to-end `moi update`: a fake bun-style global install (real server code,
// symlinked node_modules) updates itself through a real `bun install -g`
// against a local mock npm registry, into an isolated BUN_INSTALL — proving
// the whole chain: version check → owning-PM detection → install → post-update
// verification through the bin on PATH. No real network, no real global tree.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const REPO_ROOT = join(import.meta.dir, '..', '..')
const NEW_VERSION = '99.0.0'

let home: string
let fakeRoot: string // ~/.bun/install/global/node_modules/moi-computer
let registry: ReturnType<typeof Bun.serve>
let tarball: Uint8Array

// A tar archive with a single `package/` tree — the shape npm tarballs use.
async function buildTarball(): Promise<Uint8Array> {
  const dir = await mkdtemp(join(tmpdir(), 'moi-update-pkg-'))
  const pkg = join(dir, 'package')
  await mkdir(join(pkg, 'bin'), { recursive: true })
  await writeFile(
    join(pkg, 'package.json'),
    JSON.stringify({
      name: 'moi-computer',
      version: NEW_VERSION,
      bin: { moi: 'bin/moi.mjs' }
    })
  )
  // The updated bin only needs to answer `moi version`.
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

beforeAll(async () => {
  home = await mkdtemp(join(tmpdir(), 'moi-update-e2e-'))
  fakeRoot = join(home, '.bun', 'install', 'global', 'node_modules', 'moi-computer')

  // Fake global install: real server code so `bun cli.ts update` runs the real
  // flow; a stub dist/index.html so analyzeInstall sees a published install.
  await mkdir(fakeRoot, { recursive: true })
  for (const entry of ['server', 'lib', 'package.json', 'bunfig.toml', 'tsconfig.json']) {
    await cp(join(REPO_ROOT, entry), join(fakeRoot, entry), { recursive: true })
  }
  await mkdir(join(fakeRoot, 'dist'), { recursive: true })
  await writeFile(join(fakeRoot, 'dist', 'index.html'), '<html></html>')
  await symlink(join(REPO_ROOT, 'node_modules'), join(fakeRoot, 'node_modules'))

  // The repo may sit on a prerelease (…-next.N), which `moi update` refuses to
  // touch — the gate itself is covered elsewhere. Pin the fake install to a
  // stable version so the update path runs.
  const pkg = JSON.parse(await Bun.file(join(fakeRoot, 'package.json')).text()) as {
    version: string
  }
  pkg.version = '0.5.2'
  await writeFile(join(fakeRoot, 'package.json'), JSON.stringify(pkg, null, 2))

  // The `moi` on PATH, exactly as `bun i -g` lays it down.
  await mkdir(join(home, '.bun', 'bin'), { recursive: true })
  await symlink(
    join('..', 'install', 'global', 'node_modules', 'moi-computer', 'bin', 'moi.mjs'),
    join(home, '.bun', 'bin', 'moi')
  )
  await mkdir(join(fakeRoot, 'bin'), { recursive: true })
  await cp(join(REPO_ROOT, 'bin', 'moi.mjs'), join(fakeRoot, 'bin', 'moi.mjs'))

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
      if (path === '/moi-computer/latest') return Response.json(manifest)
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
}, 60_000)

afterAll(async () => {
  registry?.stop(true)
  await rm(home, { recursive: true, force: true })
})

function runUpdate(args: string[] = [], envExtra: Record<string, string> = {}) {
  return Bun.spawn(['bun', join(fakeRoot, 'server', 'cli.ts'), 'update', ...args], {
    cwd: fakeRoot,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      ...process.env,
      HOME: home,
      BUN_INSTALL: join(home, '.bun'),
      PATH: `${join(home, '.bun', 'bin')}:${process.env.PATH}`,
      MOI_NPM_REGISTRY: `http://127.0.0.1:${registry.port}`,
      NPM_CONFIG_REGISTRY: `http://127.0.0.1:${registry.port}`,
      NO_COLOR: '1',
      ...envExtra
    }
  })
}

async function setFakeVersion(version: string) {
  const pkgPath = join(fakeRoot, 'package.json')
  const pkg = JSON.parse(await Bun.file(pkgPath).text()) as { version: string }
  pkg.version = version
  await writeFile(pkgPath, JSON.stringify(pkg, null, 2))
}

// Declaration order matters: the update test replaces the fake install tree
// with the stub 99.0.0 package (that replacement is the point), so anything
// that needs the real CLI in the fake tree must run before it.
describe('moi update (e2e)', () => {
  test('refuses to touch a prerelease install', async () => {
    // Each spawned CLI re-reads package.json at module load.
    await setFakeVersion('0.6.0-next.1')
    const proc = runUpdate()
    const [code, stdout] = await Promise.all([proc.exited, new Response(proc.stdout).text()])
    expect(code).toBe(0)
    expect(stdout).toContain('Prerelease installs are updated manually')
    expect(stdout).not.toContain('via bun:')
    await setFakeVersion('0.5.2')
  }, 60_000)

  test('--check: prerelease is nothing to update, exit 0', async () => {
    await setFakeVersion('0.6.0-next.1')
    const proc = runUpdate(['--check'])
    const [code, stdout] = await Promise.all([proc.exited, new Response(proc.stdout).text()])
    expect(code).toBe(0)
    expect(stdout).toContain('Prerelease installs are updated manually')
    await setFakeVersion('0.5.2')
  }, 60_000)

  test('--check: update available exits 1 and changes nothing', async () => {
    const proc = runUpdate(['--check'])
    const [code, stdout] = await Promise.all([proc.exited, new Response(proc.stdout).text()])
    expect(code).toBe(1)
    expect(stdout).toContain(`installed v0.5.2`)
    expect(stdout).toContain(`update available: v${NEW_VERSION}`)
    expect(stdout).toContain('run `moi update` to install')
    expect(stdout).not.toContain('via bun:')
    // Side-effect-free: the install tree was not touched.
    expect(await Bun.file(join(fakeRoot, 'server', 'cli.ts')).exists()).toBe(true)
    const pkg = JSON.parse(await Bun.file(join(fakeRoot, 'package.json')).text()) as {
      version: string
    }
    expect(pkg.version).toBe('0.5.2')
  }, 60_000)

  test('--check: up to date exits 0', async () => {
    await setFakeVersion(NEW_VERSION)
    const proc = runUpdate(['--check'])
    const [code, stdout] = await Promise.all([proc.exited, new Response(proc.stdout).text()])
    expect(code).toBe(0)
    expect(stdout).toContain(`Already up to date (latest is v${NEW_VERSION})`)
    await setFakeVersion('0.5.2')
  }, 60_000)

  test('--check: unreachable registry exits 2', async () => {
    const proc = runUpdate(['--check'], { MOI_NPM_REGISTRY: 'http://127.0.0.1:1' })
    const [code, stderr] = await Promise.all([proc.exited, new Response(proc.stderr).text()])
    expect(code).toBe(2)
    expect(stderr).toContain('Could not reach the npm registry')
  }, 60_000)

  test('updates a bun global install through bun and verifies the new bin', async () => {
    const proc = runUpdate()
    const [code, stdout] = await Promise.all([proc.exited, new Response(proc.stdout).text()])
    expect(code).toBe(0)
    expect(stdout).toContain(`latest is v${NEW_VERSION}`)
    expect(stdout).toContain('via bun: bun install -g moi-computer@99.0.0')
    expect(stdout).toContain(`moi updated to v${NEW_VERSION}`)
    // The bin on PATH really is the new package now.
    const check = Bun.spawn([join(home, '.bun', 'bin', 'moi'), 'version'], {
      stdout: 'pipe',
      env: { ...process.env, PATH: `${join(home, '.bun', 'bin')}:${process.env.PATH}` }
    })
    expect((await new Response(check.stdout).text()).trim()).toBe(NEW_VERSION)
    await check.exited
  }, 120_000)
})
