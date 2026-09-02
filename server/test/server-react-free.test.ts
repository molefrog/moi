import { describe, expect, test } from 'bun:test'
import { join, relative } from 'path'

// The server must never evaluate React. `react-dom` 19.2+ throws at module load
// when the `react` it resolves is a different version, and a global `bun i -g`
// install shares one hoisted `node_modules` with every other global package —
// so moi's `react-dom` can land next to a `react` someone else locked earlier.
// Any server-side import of React turns that into "Server failed to start"
// before a single request is served (the tldraw-powered scratchpad writer used
// to). The browser gets React from moi's own vendored ESM (client/vendor/react),
// so nothing outside the browser needs it. Two guards:
//   1. a static scan: first-party server/lib code never imports `react`,
//      `react-dom`, or the `tldraw` package (whose entry point is the React
//      editor) — `tldraw/package.json` is fine, it's data;
//   2. a runtime check: loading the server's entry modules in a fresh Bun
//      process leaves no React module in `require.cache`, transitive deps
//      included — the static scan can't see what third-party code imports.

const ROOT = join(import.meta.dir, '..', '..')

// Import specifiers that evaluate React on the server. `tldraw/<file>.json` is
// data, not code, so it is allowed; anything else under `tldraw/` is not.
const FORBIDDEN_SPECIFIER = /^(?:react|react-dom)(?:\/|$)|^tldraw(?:\/(?!.*\.json$)|$)/

// Real import statements only — parsed by Bun's transpiler, so import-shaped
// text inside strings (generated applet source, say) doesn't count.
const transpiler = new Bun.Transpiler({ loader: 'ts' })
function forbiddenImports(source: string): string[] {
  return (
    transpiler
      // A CLI entry's `#!/usr/bin/env bun` line is not TypeScript.
      .scanImports(source.replace(/^#!.*\n/, ''))
      .map(i => i.path)
      .filter(path => FORBIDDEN_SPECIFIER.test(path))
  )
}

// Loaded React modules after importing `entry` in a fresh process. React's npm
// packages are CommonJS, so every one that gets evaluated shows up in
// `require.cache` under its `node_modules/react[-dom]/` path.
function reactModulesLoadedBy(entry: string): string[] {
  const code = [
    `await import(${JSON.stringify(entry)})`,
    `const hits = Object.keys(require.cache).filter(k => /node_modules\\/(react|react-dom)\\//.test(k))`,
    `console.log(JSON.stringify(hits))`,
    // tldraw leaves timers behind; don't let the process linger on them.
    `process.exit(0)`
  ].join('\n')
  const proc = Bun.spawnSync([process.execPath, '-e', code], { cwd: ROOT, env: process.env })
  if (proc.exitCode !== 0) throw new Error(`import of ${entry} failed:\n${proc.stderr.toString()}`)
  const lines = proc.stdout.toString().trim().split('\n')
  return JSON.parse(lines[lines.length - 1]) as string[]
}

describe('the server never loads React', () => {
  test('no first-party server or lib module imports react, react-dom, or tldraw', async () => {
    const offenders: string[] = []
    for (const dir of ['server', 'lib']) {
      const glob = new Bun.Glob('**/*.ts')
      for await (const file of glob.scan({ cwd: join(ROOT, dir) })) {
        if (file.endsWith('.test.ts') || file.startsWith('test/')) continue
        const path = join(ROOT, dir, file)
        const hits = forbiddenImports(await Bun.file(path).text())
        for (const hit of hits) offenders.push(`${relative(ROOT, path)}: ${hit}`)
      }
    }
    expect(offenders).toEqual([])
  })

  test('the scan recognizes the imports it forbids', () => {
    expect(forbiddenImports(`import { useState } from 'react'`)).toHaveLength(1)
    expect(forbiddenImports(`import { createRoot } from "react-dom/client"`)).toHaveLength(1)
    expect(forbiddenImports(`import { createTLStore } from 'tldraw'`)).toHaveLength(1)
    expect(forbiddenImports(`const m = await import('tldraw')`)).toHaveLength(1)
    expect(forbiddenImports(`import pkg from 'tldraw/package.json'`)).toEqual([])
    expect(forbiddenImports('const src = `import * as React from "react"`')).toEqual([])
    expect(forbiddenImports(`import { Store } from '@tldraw/store'`)).toEqual([])
    expect(forbiddenImports(`import { toRichText } from '@tldraw/tlschema'`)).toEqual([])
  })

  // `api.ts` (every HTTP route) and `control.ts` (the CLI's control port, which
  // pulls in the scratchpad writer, bundler, harnesses…) together import
  // practically the whole server. `web.ts` is left out only because importing it
  // binds the ports; it adds nothing but the Bun.serve wiring on top of these.
  test.each(['server/api.ts', 'server/control.ts'])('%s loads without React', entry => {
    expect(reactModulesLoadedBy(join(ROOT, entry))).toEqual([])
  })

  test('(control) the runtime check does see React when the tldraw package loads', () => {
    expect(reactModulesLoadedBy('tldraw').length).toBeGreaterThan(0)
  })
})
