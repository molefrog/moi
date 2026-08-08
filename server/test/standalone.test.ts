import { describe, expect, test } from 'bun:test'
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  compareStableVersions,
  flipCurrent,
  pruneVersions,
  resolveStandaloneHome,
  stableVersionFromTag,
  standaloneAssetName,
  updateStandalone,
  withRuntimeLock
} from '../standalone'
import { VERSION } from '../version'

// Tag → version rules shared by `moi update` and the release workflow: only
// stable `vX.Y.Z` tags produce installable standalone releases; `-next.N`
// preview tags (see .agents/skills/publish-next) must never reach users.
describe('stableVersionFromTag', () => {
  test('accepts stable tags, with or without the v prefix', () => {
    expect(stableVersionFromTag('v0.4.0')).toBe('0.4.0')
    expect(stableVersionFromTag('0.4.0')).toBe('0.4.0')
    expect(stableVersionFromTag('v10.20.30')).toBe('10.20.30')
  })

  test('rejects prerelease tags', () => {
    expect(stableVersionFromTag('v0.3.0-next.0')).toBeNull()
    expect(stableVersionFromTag('v0.3.0-next.12')).toBeNull()
    expect(stableVersionFromTag('v1.0.0-rc.1')).toBeNull()
  })

  test('rejects malformed and non-canonical stable tags', () => {
    for (const tag of ['banana', 'v1', 'v1.2', 'v1.2.3.4', 'v01.2.3', 'v1.2.3+meta']) {
      expect(stableVersionFromTag(tag)).toBeNull()
    }
  })
})

describe('compareStableVersions', () => {
  test('orders stable releases without number precision loss', () => {
    expect(compareStableVersions('0.3.0', '0.4.0')).toBe(-1)
    expect(compareStableVersions('v1.2.3', '1.2.3')).toBe(0)
    expect(compareStableVersions('10.0.0', '2.999.999')).toBe(1)
    expect(compareStableVersions('90071992547409930.0.0', '90071992547409929.999.999')).toBe(1)
  })

  test('refuses invalid inputs', () => {
    expect(() => compareStableVersions('next', '1.0.0')).toThrow('invalid versions')
  })
})

describe('standaloneAssetName', () => {
  test('matches the naming scripts/build-standalone.ts produces', () => {
    expect(standaloneAssetName('0.4.0', 'darwin-arm64')).toBe(
      'moi-standalone-0.4.0-darwin-arm64.tar.gz'
    )
  })
})

describe('resolveStandaloneHome', () => {
  test('accepts a dedicated absolute directory', () => {
    const home = mkdtempSync(join(tmpdir(), 'moi-standalone-home-'))
    try {
      expect(resolveStandaloneHome(home)).toBe(realpathSync(home))
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })

  test('rejects relative, filesystem-root, and user-home paths', () => {
    expect(() => resolveStandaloneHome('relative')).toThrow('absolute path')
    expect(() => resolveStandaloneHome('/')).toThrow('unsafe')
    expect(() => resolveStandaloneHome(homedir())).toThrow('unsafe')
  })
})

describe('updateStandalone', () => {
  test('--check reports a platform release without mutating the runtime', async () => {
    const home = mkdtempSync(join(tmpdir(), 'moi-standalone-check-'))
    const version = '9.0.0'
    const asset = standaloneAssetName(version, `${process.platform}-${process.arch}`)
    const api = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      fetch() {
        return Response.json({
          tag_name: `v${version}`,
          assets: [
            { name: asset, browser_download_url: `https://example.test/${asset}` },
            {
              name: `${asset}.sha256`,
              browser_download_url: `https://example.test/${asset}.sha256`
            }
          ]
        })
      }
    })
    const oldHome = process.env.MOI_STANDALONE_HOME
    const oldApi = process.env.MOI_GITHUB_API
    process.env.MOI_STANDALONE_HOME = home
    process.env.MOI_GITHUB_API = `http://127.0.0.1:${api.port}`

    try {
      await expect(updateStandalone({ check: true })).resolves.toEqual({
        status: 'available',
        current: VERSION,
        latest: version
      })
      expect(readdirSync(home)).toEqual([])
    } finally {
      api.stop(true)
      if (oldHome === undefined) delete process.env.MOI_STANDALONE_HOME
      else process.env.MOI_STANDALONE_HOME = oldHome
      if (oldApi === undefined) delete process.env.MOI_GITHUB_API
      else process.env.MOI_GITHUB_API = oldApi
      rmSync(home, { recursive: true, force: true })
    }
  })
})

describe('flipCurrent', () => {
  test('retargets the current symlink across repeated flips', async () => {
    const runtime = mkdtempSync(join(tmpdir(), 'moi-standalone-'))
    mkdirSync(join(runtime, '0.1.0'))
    mkdirSync(join(runtime, '0.2.0'))

    await flipCurrent(runtime, '0.1.0')
    expect(readlinkSync(join(runtime, 'current'))).toBe('0.1.0')

    await flipCurrent(runtime, '0.2.0')
    expect(readlinkSync(join(runtime, 'current'))).toBe('0.2.0')
  })

  test('uses independent temporary links for concurrent flips', async () => {
    const runtime = mkdtempSync(join(tmpdir(), 'moi-standalone-'))
    mkdirSync(join(runtime, '0.1.0'))
    mkdirSync(join(runtime, '0.2.0'))

    const flips = await Promise.allSettled([
      flipCurrent(runtime, '0.1.0'),
      flipCurrent(runtime, '0.2.0')
    ])
    expect(flips.every(result => result.status === 'fulfilled')).toBe(true)
    expect(['0.1.0', '0.2.0']).toContain(readlinkSync(join(runtime, 'current')))
  })
})

describe('withRuntimeLock', () => {
  test('serializes concurrent runtime mutations', async () => {
    const runtime = mkdtempSync(join(tmpdir(), 'moi-standalone-'))
    let active = 0
    let maxActive = 0
    const operation = () =>
      withRuntimeLock(runtime, async () => {
        active++
        maxActive = Math.max(maxActive, active)
        await Bun.sleep(20)
        active--
      })

    await Promise.all([operation(), operation()])
    expect(maxActive).toBe(1)
  })

  test('reaps a lock whose owner process no longer exists', async () => {
    const runtime = mkdtempSync(join(tmpdir(), 'moi-standalone-'))
    symlinkSync('999999999-dead', join(runtime, '.install-lock'))
    let ran = false

    await withRuntimeLock(runtime, async () => {
      ran = true
    })

    expect(ran).toBe(true)
  })
})

describe('pruneVersions', () => {
  test('keeps the kept versions, current, and dotted work files; drops the rest', async () => {
    const runtime = mkdtempSync(join(tmpdir(), 'moi-standalone-'))
    for (const version of ['0.1.0', '0.2.0', '0.3.0']) mkdirSync(join(runtime, version))
    symlinkSync('0.3.0', join(runtime, 'current'))
    mkdirSync(join(runtime, '.stage-123'))
    writeFileSync(join(runtime, '.download.tar.gz'), '')

    await pruneVersions(runtime, ['0.3.0', '0.2.0'])

    const left = new Set(readdirSync(runtime))
    expect(left.has('0.1.0')).toBe(false)
    expect(left.has('0.2.0')).toBe(true)
    expect(left.has('0.3.0')).toBe(true)
    expect(left.has('current')).toBe(true)
    expect(left.has('.stage-123')).toBe(true)
    expect(left.has('.download.tar.gz')).toBe(true)
  })
})

// Pin the release workflow's load-bearing invariants: previews stay private,
// stable tags match package.json, build jobs cannot write repository contents,
// and only one final job publishes a complete draft.
describe('standalone artifacts in the release workflow', () => {
  const workflow = join(import.meta.dir, '..', '..', '.github', 'workflows', 'release.yml')

  test('standalone jobs and the GitHub release skip prerelease tags', async () => {
    const text = await Bun.file(workflow).text()
    const guards = text
      .split('\n')
      .filter(line => line.includes("if: ${{ !contains(inputs.tag || github.ref_name, '-') }}"))
    expect(guards.length).toBe(3)
    expect(guards.every(line => line.trim().startsWith('if:'))).toBe(true)
  })

  test('publishes once, only after npm and both build matrices finish', async () => {
    const text = await Bun.file(workflow).text()
    expect(text).toContain("tags: ['v*']")
    expect(text.split('uses: softprops/action-gh-release@v2').length - 1).toBe(1)
    expect(text).toContain('needs: [publish, standalone, desktop]')
    expect(text).toContain('draft: true')
    expect(text).toContain('gh release edit "$RELEASE_TAG" --draft=false --latest')
  })

  test('validates the tag and narrows write permission to the GitHub publisher', async () => {
    const text = await Bun.file(workflow).text()
    expect(text).toContain('[ "$VERSION" = "$PKG" ]')
    expect(text).toContain('permissions:\n  contents: read')
    expect(text.split('contents: write').length - 1).toBe(1)
  })

  test('requires every checksum before publishing', async () => {
    const text = await Bun.file(workflow).text()
    expect(text).toContain('test -f "release-assets/$asset.sha256"')
    expect(text).toContain('sha256sum -c "$asset.sha256"')
  })

  test('builds licensed clients on current hosted runner labels', async () => {
    const text = await Bun.file(workflow).text()
    expect(text).toContain('PUBLIC_TLDRAW_LICENSE_KEY: ${{ vars.PUBLIC_TLDRAW_LICENSE_KEY }}')
    expect(text).toContain('runner: macos-15-intel')
    expect(text).not.toContain('runner: macos-13')
  })
})

describe('installer and desktop invariants', () => {
  const installer = join(import.meta.dir, '..', '..', 'packaging', 'install.sh')
  const desktop = join(import.meta.dir, '..', '..', 'desktop', 'src-tauri', 'src', 'main.rs')

  test('the shell installer fails closed without a checksum', async () => {
    const text = await Bun.file(installer).text()
    expect(text).toContain('has no checksum for $asset — install unchanged')
    expect(text).not.toContain('skipping verification')
  })

  test('all standalone writers use the shared install lock name', async () => {
    const sources = [
      await Bun.file(join(import.meta.dir, '..', 'standalone.ts')).text(),
      await Bun.file(installer).text(),
      await Bun.file(desktop).text()
    ]
    expect(sources.every(text => text.includes('.install-lock'))).toBe(true)
  })

  test('desktop identifies moi and prunes superseded runtimes', async () => {
    const text = await Bun.file(desktop).text()
    expect(text).toContain('GET /status HTTP/1.1')
    expect(text).toContain('moi server status\\n')
    expect(text).toContain('prune_versions(&runtime, &keep)?')
  })

  test('both shim writers shell-quote a custom home', async () => {
    const installerText = await Bun.file(installer).text()
    const desktopText = await Bun.file(desktop).text()
    expect(installerText).toContain('shell_quote()')
    expect(desktopText).toContain('fn shell_quote(value: &str)')
  })

  test('desktop boot branding and native icons use the canonical client asset', async () => {
    const build = await Bun.file(
      join(import.meta.dir, '..', '..', 'scripts', 'build-desktop.ts')
    ).text()
    const iconBuild = await Bun.file(
      join(import.meta.dir, '..', '..', 'scripts', 'build-desktop-icons.ts')
    ).text()
    const bootPage = await Bun.file(
      join(import.meta.dir, '..', '..', 'desktop', 'ui', 'index.html')
    ).text()
    expect(build).toContain('plugins: [tailwind]')
    expect(iconBuild).toContain("join(ROOT, 'client', 'assets', 'favicon.png')")
    expect(bootPage).toContain('src="../../client/assets/favicon.png"')
    expect(bootPage).toContain('Copy diagnostics')
  })

  test('desktop version comes from the root package metadata', async () => {
    const config = await Bun.file(
      join(import.meta.dir, '..', '..', 'desktop', 'src-tauri', 'tauri.conf.json')
    ).text()
    expect(config).toContain('"version": "../../package.json"')
  })
})
