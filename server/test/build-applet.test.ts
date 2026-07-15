import { afterAll, beforeAll, describe, expect, spyOn, test } from 'bun:test'
import { rmSync } from 'node:fs'
import { join } from 'path'

import { buildApplet, extractViewConfig, extractWidgetConfig } from '../bundler/build-applet'

const FIXTURES = join(import.meta.dir, '__fixtures__')

// Warmup: under `bun test` (and only there) the very FIRST Bun.build in the
// process with this exact option combo (virtual entry + tailwind plugin +
// root + inline sourcemap + esm) fails to resolve the entry's import with
// "Could not resolve"; the identical second call succeeds. Pre-existing Bun
// quirk (1.3.x), not reproducible outside the test runner — swallow one
// throwaway build so every real test starts from the working state.
beforeAll(async () => {
  await buildApplet(join(FIXTURES, 'hello.tsx')).catch(() => {})
})

describe('buildApplet', () => {
  test('builds a basic widget with React externalized', async () => {
    const result = await buildApplet(join(FIXTURES, 'hello.tsx'))

    expect(result.js).toBeTruthy()
    expect(result.js).toContain('from "react"')
    expect(result.js).toContain('HelloWidget')
    expect(result.serverModules).toEqual([])
  })

  // Regression: applets must ALWAYS compile to the production automatic JSX
  // runtime (`jsx`/`jsxs` from react/jsx-runtime), never the dev transform
  // (`jsxDEV`). The bundle is served as-is under both the development and
  // production React (vendor route), and only the production React has
  // `jsxDEV === undefined` — a dev-transform bundle would crash every applet
  // there ("jsxDEV is not a function"). `jsx`/`jsxs` exist in both builds, so a
  // production-transform bundle is mode-agnostic. Regardless of `prebuilt`.
  test('always emits the production JSX runtime (mode-agnostic)', async () => {
    const result = await buildApplet(join(FIXTURES, 'hello.tsx'))

    expect(result.js).toContain('/jsx-runtime')
    expect(result.js).not.toContain('jsx-dev-runtime')
    expect(result.js).not.toContain('jsxDEV')
  })

  test('registers scoped Tailwind CSS on the host registry (no direct DOM append)', async () => {
    const result = await buildApplet(join(FIXTURES, 'hello.tsx'))

    // The bundle hands its CSS to the host via window.__moiAppletCss instead
    // of appending a <style> itself; the host mounts/unmounts the tag with the
    // applet (client/features/applets/applet-styles.ts).
    expect(result.js).toContain('__moiAppletCss')
    expect(result.js).toContain('import.meta.url')
    expect(result.js).not.toContain('document.createElement("style")')
    // Every rule is scoped to the applet's mount container.
    expect(result.js).toContain('[data-applet=')
    expect(result.js).toContain('widget:hello')
  })

  test('rewrites .server.ts imports to rpc() stubs', async () => {
    const result = await buildApplet(join(FIXTURES, 'with-server.tsx'))

    // Should use rpc("with-server", "getWeather") pattern
    expect(result.js).toContain('rpc("with-server", "getWeather")')
    expect(result.js).not.toContain('temp: 72')

    expect(result.serverModules).toHaveLength(1)
    expect(result.serverModules[0].name).toBe('with-server')
    expect(result.serverModules[0].exports.sort()).toEqual(['getForecast', 'getWeather'])
  })

  test('bundles devalue stringify/parse into the rpc module', async () => {
    const result = await buildApplet(join(FIXTURES, 'with-server.tsx'))

    // devalue's stringify should be used for request body
    expect(result.js).toContain('stringify')
    // devalue's parse should be used for response
    expect(result.js).toContain('parse')
  })

  test('rpc stub targets the workspace API base + /rpc/', async () => {
    const result = await buildApplet(join(FIXTURES, 'with-server.tsx'))

    // The base is a sentinel the serve route rewrites to /api/workspaces/<id>.
    expect(result.js).toContain('%%MOI_APPLET_API_BASE%%')
    expect(result.js).toContain('"/rpc/"')
    expect(result.js).toContain('"POST"')
    // The old global-lookup form is gone.
    expect(result.js).not.toContain('/_rpc/')
    expect(result.js).not.toContain('__MEI_WS__')
  })

  test('tree-shakes unused server function proxies', async () => {
    const result = await buildApplet(join(FIXTURES, 'with-server.tsx'))

    expect(result.js).toContain('rpc("with-server", "getWeather")')
    // getForecast still in serverModules even if tree-shaken from JS
    expect(result.serverModules[0].exports).toContain('getForecast')
  })

  test('rejects sync function export from .server.ts', async () => {
    await expect(buildApplet(join(FIXTURES, 'bad-sync.tsx'))).rejects.toThrow(
      'not an async function'
    )
  })

  test('rejects const export from .server.ts', async () => {
    await expect(buildApplet(join(FIXTURES, 'bad-const.tsx'))).rejects.toThrow('"API_VERSION"')
  })

  test('produces inline source maps', async () => {
    const result = await buildApplet(join(FIXTURES, 'hello.tsx'))

    expect(result.js).toContain('//# sourceMappingURL=data:')
  })

  test('handles .ts widgets (not just .tsx)', async () => {
    const result = await buildApplet(join(FIXTURES, 'plain.ts'))

    expect(result.js).toContain('PlainWidget')
    expect(result.js).toContain('export')
  })

  test('ignores type exports from .server.ts', async () => {
    const result = await buildApplet(join(FIXTURES, 'with-types.tsx'))

    expect(result.serverModules[0].exports).toEqual(['getWeather'])
    expect(result.js).toContain('rpc("with-types", "getWeather")')
  })

  test('throws on nonexistent entrypoint', async () => {
    await expect(buildApplet(join(FIXTURES, 'nope.tsx'))).rejects.toThrow()
  })

  test('resolves .server import without .ts extension', async () => {
    const result = await buildApplet(join(FIXTURES, 'with-server.tsx'))
    expect(result.js).toContain('rpc("with-server"')
  })

  test('handles widget importing multiple server modules', async () => {
    const result = await buildApplet(join(FIXTURES, 'multi-server.tsx'))

    expect(result.serverModules).toHaveLength(2)
    const names = result.serverModules.map(m => m.name).sort()
    expect(names).toEqual(['alpha', 'beta'])
    expect(result.js).toContain('rpc("alpha"')
    expect(result.js).toContain('rpc("beta"')
  })

  test('handles empty server module (no exports)', async () => {
    const result = await buildApplet(join(FIXTURES, 'empty-server.tsx'))

    expect(result.serverModules).toHaveLength(1)
    expect(result.serverModules[0].exports).toEqual([])
  })

  test('handles server function with $ in name', async () => {
    const result = await buildApplet(join(FIXTURES, 'dollar-fn.tsx'))

    expect(result.js).toContain('rpc("dollar-fn", "get$Data")')
    expect(result.serverModules[0].exports).toContain('get$Data')
  })

  test('handles widget with syntax error', async () => {
    await expect(buildApplet(join(FIXTURES, 'syntax-error.tsx'))).rejects.toThrow()
  })

  test('extracts config from artifact when widget exports config', async () => {
    const result = await buildApplet(join(FIXTURES, 'with-config.tsx'))
    expect(result.config).toEqual({ rowSpan: 2, colSpan: 4 })
  })

  test('artifact config is null when widget has no config export', async () => {
    const result = await buildApplet(join(FIXTURES, 'hello.tsx'))
    expect(result.config).toBeNull()
  })

  test('keys server modules by path relative to moiRoot', async () => {
    const result = await buildApplet(join(FIXTURES, 'nested', 'widget.tsx'), FIXTURES)

    expect(result.serverModules).toHaveLength(1)
    expect(result.serverModules[0].name).toBe('nested/deep')
    expect(result.js).toContain('rpc("nested/deep", "getDeep")')
  })

  test('explicit moiRoot equal to the widget dir keeps basename keys', async () => {
    const result = await buildApplet(join(FIXTURES, 'with-server.tsx'), FIXTURES)

    expect(result.serverModules[0].name).toBe('with-server')
    expect(result.js).toContain('rpc("with-server", "getWeather")')
  })

  test('rejects a server import that escapes the moi root', async () => {
    await expect(
      buildApplet(join(FIXTURES, 'nested', 'escape.tsx'), join(FIXTURES, 'nested'))
    ).rejects.toThrow('escapes the moi root')
  })

  test('keys correctly when the moi root sits behind a symlink', async () => {
    // On macOS `/tmp` → `/private/tmp`: Bun's resolver canonicalizes server
    // file paths, so an un-canonicalized moiRoot must not read as an escape.
    const { mkdtempSync, symlinkSync, rmSync, mkdirSync, writeFileSync } = await import('node:fs')

    // Inside the repo tree (not os.tmpdir()) so the widget's `@import
    // 'tailwindcss'` resolves against the repo's node_modules.
    const realRoot = mkdtempSync(join(import.meta.dir, 'moi-real-'))
    const linkRoot = realRoot + '-link'
    symlinkSync(realRoot, linkRoot)
    try {
      mkdirSync(join(realRoot, 'widgets'))
      writeFileSync(
        join(realRoot, 'widgets', 'sym.server.ts'),
        'export async function getSym() { return 1 }\n'
      )
      writeFileSync(
        join(realRoot, 'widgets', 'sym.tsx'),
        "import { getSym } from './sym.server'\n" +
          'export default function Sym() { return <button onClick={() => getSym()}>s</button> }\n'
      )

      const result = await buildApplet(join(linkRoot, 'widgets', 'sym.tsx'), linkRoot)
      expect(result.serverModules[0].name).toBe('widgets/sym')
    } finally {
      rmSync(linkRoot)
      rmSync(realRoot, { recursive: true, force: true })
    }
  })
})

describe('extractWidgetConfig', () => {
  test('extracts rowSpan and colSpan from exported config object', async () => {
    const config = await extractWidgetConfig(join(FIXTURES, 'with-config.tsx'))
    expect(config).toEqual({ rowSpan: 2, colSpan: 4 })
  })

  test('returns null when no config export', async () => {
    const config = await extractWidgetConfig(join(FIXTURES, 'hello.tsx'))
    expect(config).toBeNull()
  })

  test('uses defaults for missing keys (partial config)', async () => {
    const config = await extractWidgetConfig(join(FIXTURES, 'with-partial-config.tsx'))
    expect(config).toEqual({ rowSpan: 1, colSpan: 3 })
  })

  test('warns and uses defaults for out-of-range values', async () => {
    const warn = spyOn(console, 'warn')
    const config = await extractWidgetConfig(join(FIXTURES, 'with-bad-config.tsx'))
    expect(config).toEqual({ rowSpan: 1, colSpan: 2 })
    expect(warn).toHaveBeenCalledTimes(2)
    warn.mockRestore()
  })

  test('extracts requiredEnv string array alongside spans', async () => {
    const config = await extractWidgetConfig(join(FIXTURES, 'with-required-env.tsx'))
    expect(config).toEqual({
      rowSpan: 2,
      colSpan: 2,
      requiredEnv: ['ELEVENLABS_API_KEY', 'ELEVENLABS_VOICE_ID']
    })
  })
})

describe('extractViewConfig', () => {
  test('extracts title and requiredEnv', async () => {
    const config = await extractViewConfig(join(FIXTURES, 'with-view-config.tsx'))
    expect(config).toEqual({ title: 'My View', requiredEnv: ['API_KEY'] })
  })

  test('returns null when there is no config export', async () => {
    expect(await extractViewConfig(join(FIXTURES, 'hello.tsx'))).toBeNull()
  })

  test('ignores widget-only span fields', async () => {
    // with-config.tsx exports { rowSpan, colSpan } — none of which a view honors.
    expect(await extractViewConfig(join(FIXTURES, 'with-config.tsx'))).toEqual({})
  })
})

describe("buildApplet kind='view'", () => {
  test('parses the view config (title + requiredEnv, no spans)', async () => {
    const result = await buildApplet(join(FIXTURES, 'with-view-config.tsx'), undefined, 'view')
    expect(result.config).toEqual({ title: 'My View', requiredEnv: ['API_KEY'] })
  })

  test('namespaces the CSS scope with the view kind', async () => {
    const result = await buildApplet(join(FIXTURES, 'with-view-config.tsx'), undefined, 'view')
    // Prevents a widget and a view sharing a name from clobbering each other.
    expect(result.js).toContain('view:with-view-config')
  })

  test('widget kind uses the widget: scope namespace', async () => {
    const result = await buildApplet(join(FIXTURES, 'hello.tsx'), undefined, 'widget')
    expect(result.js).toContain('widget:hello')
    expect(result.js).not.toContain('view:hello')
  })
})

describe('asset imports', () => {
  test('emits a hashed asset and references it via import.meta.url', async () => {
    const result = await buildApplet(join(FIXTURES, 'with-asset.tsx'), undefined, 'view')
    const asset = result.files.find(f => f.kind === 'asset')
    expect(asset).toBeTruthy()
    expect(asset!.name).toMatch(/^logo-[0-9a-f]+\.png$/)
    expect(asset!.data).toBeInstanceOf(Uint8Array)
    // Self-locating: resolved module-relative, so no API base is baked in.
    expect(result.js).toContain('import.meta.url')
    expect(result.js).toContain(asset!.name)
    expect(result.js).not.toContain('%%MOI_APPLET_API_BASE%%')
  })

  test('the index.js entry is always a code file equal to .js', async () => {
    const result = await buildApplet(join(FIXTURES, 'with-asset.tsx'), undefined, 'view')
    const entry = result.files.find(f => f.name === 'index.js')
    expect(entry?.kind).toBe('code')
    expect(entry?.data).toBe(result.js)
  })
})

describe('moi fileUrl module', () => {
  test('compiles fileUrl against the sentinel base + /fs/', async () => {
    const result = await buildApplet(join(FIXTURES, 'with-fileurl.tsx'), undefined, 'view')
    expect(result.js).toContain('function fileUrl')
    expect(result.js).toContain('%%MOI_APPLET_API_BASE%%')
    expect(result.js).toContain('"/fs/"')
  })
})

describe('mixed widget + view build (Tailwind isolation)', () => {
  const ROOT = join(FIXTURES, 'kindmix')

  afterAll(() => {
    rmSync(join(ROOT, '.build'), { recursive: true, force: true })
  })

  // Regression guard for the shared-synthetic-CSS race: widgets and views build
  // concurrently under one moiRoot but from different source dirs. Each kind
  // must write its OWN `@source` (per-kind synthetic CSS file) so neither
  // compiles against the other's directory.
  test('each kind compiles only its own utilities', async () => {
    const [widget, view] = await Promise.all([
      buildApplet(join(ROOT, 'widgets', 'wmix.tsx'), ROOT, 'widget'),
      buildApplet(join(ROOT, 'views', 'vmix.tsx'), ROOT, 'view')
    ])
    // Assert on the compiled utility SELECTOR (`.tabular-nums` / `.tracking-widest`),
    // which is emitted only when that kind's @source actually saw the class — a
    // leaked @source would produce the sibling's selector. (Bare property names
    // like `letter-spacing` are unreliable: they also appear in Tailwind's
    // preflight reset.)
    expect(widget.js).toContain('.tabular-nums')
    expect(widget.js).not.toContain('.tracking-widest')
    expect(view.js).toContain('.tracking-widest')
    expect(view.js).not.toContain('.tabular-nums')
  })
})
