import { describe, expect, spyOn, test } from 'bun:test'
import { join } from 'path'

import { buildWidget, extractWidgetConfig } from '../build-widget'

const FIXTURES = join(import.meta.dir, '__fixtures__')

describe('buildWidget', () => {
  test('builds a basic widget with React externalized', async () => {
    const result = await buildWidget(join(FIXTURES, 'hello.tsx'))

    expect(result.js).toBeTruthy()
    expect(result.js).toContain('from "react"')
    expect(result.js).toContain('HelloWidget')
    expect(result.serverModules).toEqual([])
  })

  test('includes Tailwind CSS injected as a style tag', async () => {
    const result = await buildWidget(join(FIXTURES, 'hello.tsx'))

    expect(result.js).toContain('data-widget')
    expect(result.js).toContain('document.createElement("style")')
  })

  test('derives widget name from filename for CSS injection', async () => {
    const result = await buildWidget(join(FIXTURES, 'hello.tsx'))

    expect(result.js).toContain(', "hello");')
  })

  test('rewrites .server.ts imports to rpc() stubs', async () => {
    const result = await buildWidget(join(FIXTURES, 'with-server.tsx'))

    // Should use rpc("with-server", "getWeather") pattern
    expect(result.js).toContain('rpc("with-server", "getWeather")')
    expect(result.js).not.toContain('temp: 72')

    expect(result.serverModules).toHaveLength(1)
    expect(result.serverModules[0].name).toBe('with-server')
    expect(result.serverModules[0].exports.sort()).toEqual(['getForecast', 'getWeather'])
  })

  test('bundles devalue stringify/parse into the rpc module', async () => {
    const result = await buildWidget(join(FIXTURES, 'with-server.tsx'))

    // devalue's stringify should be used for request body
    expect(result.js).toContain('stringify')
    // devalue's parse should be used for response
    expect(result.js).toContain('parse')
  })

  test('rpc function constructs /_mei/fn/ URL', async () => {
    const result = await buildWidget(join(FIXTURES, 'with-server.tsx'))

    expect(result.js).toContain('"/_mei/fn/"')
    expect(result.js).toContain('"POST"')
  })

  test('tree-shakes unused server function proxies', async () => {
    const result = await buildWidget(join(FIXTURES, 'with-server.tsx'))

    expect(result.js).toContain('rpc("with-server", "getWeather")')
    // getForecast still in serverModules even if tree-shaken from JS
    expect(result.serverModules[0].exports).toContain('getForecast')
  })

  test('rejects sync function export from .server.ts', async () => {
    await expect(buildWidget(join(FIXTURES, 'bad-sync.tsx'))).rejects.toThrow(
      'not an async function'
    )
  })

  test('rejects const export from .server.ts', async () => {
    await expect(buildWidget(join(FIXTURES, 'bad-const.tsx'))).rejects.toThrow('"API_VERSION"')
  })

  test('produces inline source maps', async () => {
    const result = await buildWidget(join(FIXTURES, 'hello.tsx'))

    expect(result.js).toContain('//# sourceMappingURL=data:')
  })

  test('handles .ts widgets (not just .tsx)', async () => {
    const result = await buildWidget(join(FIXTURES, 'plain.ts'))

    expect(result.js).toContain('PlainWidget')
    expect(result.js).toContain('export')
  })

  test('ignores type exports from .server.ts', async () => {
    const result = await buildWidget(join(FIXTURES, 'with-types.tsx'))

    expect(result.serverModules[0].exports).toEqual(['getWeather'])
    expect(result.js).toContain('rpc("with-types", "getWeather")')
  })

  test('throws on nonexistent entrypoint', async () => {
    await expect(buildWidget(join(FIXTURES, 'nope.tsx'))).rejects.toThrow()
  })

  test('resolves .server import without .ts extension', async () => {
    const result = await buildWidget(join(FIXTURES, 'with-server.tsx'))
    expect(result.js).toContain('rpc("with-server"')
  })

  test('handles widget importing multiple server modules', async () => {
    const result = await buildWidget(join(FIXTURES, 'multi-server.tsx'))

    expect(result.serverModules).toHaveLength(2)
    const names = result.serverModules.map(m => m.name).sort()
    expect(names).toEqual(['alpha', 'beta'])
    expect(result.js).toContain('rpc("alpha"')
    expect(result.js).toContain('rpc("beta"')
  })

  test('handles empty server module (no exports)', async () => {
    const result = await buildWidget(join(FIXTURES, 'empty-server.tsx'))

    expect(result.serverModules).toHaveLength(1)
    expect(result.serverModules[0].exports).toEqual([])
  })

  test('handles server function with $ in name', async () => {
    const result = await buildWidget(join(FIXTURES, 'dollar-fn.tsx'))

    expect(result.js).toContain('rpc("dollar-fn", "get$Data")')
    expect(result.serverModules[0].exports).toContain('get$Data')
  })

  test('handles widget with syntax error', async () => {
    await expect(buildWidget(join(FIXTURES, 'syntax-error.tsx'))).rejects.toThrow()
  })

  test('extracts config from artifact when widget exports config', async () => {
    const result = await buildWidget(join(FIXTURES, 'with-config.tsx'))
    expect(result.config).toEqual({ rowSpan: 2, colSpan: 4 })
  })

  test('artifact config is null when widget has no config export', async () => {
    const result = await buildWidget(join(FIXTURES, 'hello.tsx'))
    expect(result.config).toBeNull()
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
})
