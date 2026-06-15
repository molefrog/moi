import type {
  ExportNamedDeclaration,
  VariableDeclarator
} from '@typescript-eslint/types/dist/generated/ast-spec'
import { parse } from '@typescript-eslint/typescript-estree'
import type { BunPlugin } from 'bun'
import tailwind from 'bun-plugin-tailwind'
import { realpathSync } from 'node:fs'
import { basename, dirname, join, relative, sep } from 'path'

import type { WidgetConfig } from '@/lib/types'

const EXTERNAL_MODULES = [
  'react',
  'react/jsx-runtime',
  'react/jsx-dev-runtime',
  'react-dom',
  'react-dom/client'
]

type ServerModule = {
  name: string
  exports: string[]
}

export type WidgetArtifact = {
  js: string
  serverModules: ServerModule[]
  config: WidgetConfig | null
}

const DEFAULT_CONFIG: WidgetConfig = { rowSpan: 1, colSpan: 2 }
const VALID_SPANS = [1, 2, 3, 4] as const

export async function extractWidgetConfig(srcPath: string): Promise<WidgetConfig | null> {
  const source = await Bun.file(srcPath).text()
  const widgetName = basename(srcPath).replace(/\.tsx?$/, '')

  const ast = parse(source, { jsx: true, errorOnUnknownASTType: false })

  const exportDecl = ast.body.find(
    node =>
      node.type === 'ExportNamedDeclaration' &&
      node.declaration?.type === 'VariableDeclaration' &&
      node.declaration.declarations.some(d => d.id.type === 'Identifier' && d.id.name === 'config')
  ) as ExportNamedDeclaration | undefined
  if (!exportDecl) return null

  const varDecl = exportDecl.declaration
  if (varDecl?.type !== 'VariableDeclaration') return null

  const decl = varDecl.declarations.find(
    (d): d is VariableDeclarator & { id: { type: 'Identifier'; name: string } } =>
      d.id.type === 'Identifier' && d.id.name === 'config'
  )
  const rawInit = decl?.init
  // Unwrap `as const` — AST wraps the object in TSAsExpression
  const init = rawInit?.type === 'TSAsExpression' ? rawInit.expression : rawInit
  if (init?.type !== 'ObjectExpression') return null

  const result: Partial<WidgetConfig> = {}

  for (const prop of init.properties) {
    if (prop.type !== 'Property' || prop.key?.type !== 'Identifier') continue
    const key = prop.key.name as string
    if (key !== 'rowSpan' && key !== 'colSpan') continue
    if (prop.value?.type !== 'Literal' || typeof prop.value.value !== 'number') continue

    const val = prop.value.value
    if (!(VALID_SPANS as readonly number[]).includes(val)) {
      console.warn(`[mei] "${widgetName}": config.${key}=${val} is out of 1–4 range, using default`)
      continue
    }
    result[key] = val as 1 | 2 | 3 | 4
  }

  return { ...DEFAULT_CONFIG, ...result }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function validateServerExports(filePath: string): Promise<string[]> {
  const source = await Bun.file(filePath).text()
  const transpiler = new Bun.Transpiler({ loader: 'ts' })
  const { exports } = transpiler.scan(source)

  const runtimeExports = exports.filter(name => {
    const escaped = escapeRegex(name)
    const typePattern = new RegExp(`export\\s+(type|interface)\\s+${escaped}\\b`)
    return !typePattern.test(source)
  })

  for (const name of runtimeExports) {
    const escaped = escapeRegex(name)
    const asyncFnPattern = new RegExp(
      `export\\s+async\\s+function\\*?\\s+${escaped}\\b` +
        '|' +
        `export\\s+const\\s+${escaped}\\s*=\\s*async\\s*[\\(]`
    )
    if (!asyncFnPattern.test(source)) {
      throw new Error(
        `"${name}" in ${basename(filePath)} is not an async function. ` +
          `.server.ts files can only export async functions.`
      )
    }
  }

  return runtimeExports
}

// The mei:rpc virtual module — contains the RPC call logic with devalue serialization.
// Bundled into the widget output once, shared by all server function stubs.
const RPC_MODULE_SOURCE = `
import { stringify, parse } from "devalue";

export function rpc(module, name) {
  return async (...args) => {
    const ws = window.__MEI_WS__ || "default";
    const res = await fetch("/_rpc/" + ws + "/fn/" + module + "/" + name, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: stringify(args),
    });
    if (!res.ok) throw new Error(await res.text());
    return parse(await res.text());
  };
}
`

// Server modules are keyed by their path relative to the moi root
// (`.moi/widgets/hello.server.ts` → `"widgets/hello"`), posix-normalized so
// keys are stable across platforms. Throws when the file escapes the root.
// Both sides are canonicalized first: Bun's resolver returns realpaths
// (e.g. `/tmp` → `/private/tmp` on macOS), and a symlinked root must not
// look like an escape.
function realpathOr(path: string): string {
  try {
    return realpathSync(path)
  } catch {
    return path
  }
}

function serverModuleKey(serverPath: string, moiRoot: string): string {
  const key = relative(realpathOr(moiRoot), realpathOr(serverPath))
    .replace(/\.server\.ts$/, '')
    .split(sep)
    .join('/')
  if (key === '..' || key.startsWith('../')) {
    throw new Error(`Server file "${serverPath}" escapes the moi root "${moiRoot}"`)
  }
  return key
}

function serverProxyPlugin(
  sourceDir: string,
  moiRoot: string
): {
  plugin: BunPlugin
  serverModules: ServerModule[]
} {
  const serverModules: ServerModule[] = []

  const plugin: BunPlugin = {
    name: 'server-proxy',
    setup(build) {
      // Resolve mei:rpc virtual module
      build.onResolve({ filter: /^mei:rpc$/ }, () => ({
        path: 'mei:rpc',
        namespace: 'mei-rpc'
      }))

      build.onLoad({ filter: /.*/, namespace: 'mei-rpc' }, () => ({
        contents: RPC_MODULE_SOURCE,
        loader: 'js'
      }))

      // Intercept .server imports (relative only). Resolved against the
      // importing file's directory — server files may live anywhere under
      // the moi root, e.g. `../lib/db.server`.
      build.onResolve({ filter: /\.server(\.ts)?$/ }, args => {
        if (!args.path.startsWith('.')) return
        const baseDir =
          args.importer && args.importer.includes(sep) ? dirname(args.importer) : sourceDir
        return {
          path: join(baseDir, args.path.replace(/\.server(\.ts)?$/, '.server.ts')),
          namespace: 'server-proxy'
        }
      })

      // Generate proxy stubs using mei:rpc
      build.onLoad({ filter: /.*/, namespace: 'server-proxy' }, async args => {
        const exports = await validateServerExports(args.path)
        const moduleName = serverModuleKey(args.path, moiRoot)

        serverModules.push({ name: moduleName, exports })

        const lines = [
          `import { rpc } from "mei:rpc";`,
          ...exports.map(
            name =>
              `export const ${name} = rpc(${JSON.stringify(moduleName)}, ${JSON.stringify(name)});`
          )
        ]

        return { contents: lines.join('\n'), loader: 'js' }
      })
    }
  }

  return { plugin, serverModules }
}

// Path to the host's `@theme inline` block — shared with `client/index.css`.
// Inlined into the widget's synthetic CSS at build time so Tailwind sees the
// theme tokens.
const HOST_THEME_PATH = join(import.meta.dir, '..', 'client', 'theme.css')

// Three things matter for widget styling:
//   1. The umbrella `@import 'tailwindcss'` brings in @layer theme + base +
//      utilities — which is what spacing/color utilities like `left-2.5`,
//      `gap-1.5`, `text-amber-500` need to resolve. The split
//      `theme`/`utilities` imports skip the `@layer theme` wrapper and theme
//      variables aren't in scope at compile time.
//   2. The host's `@theme inline` block (inlined from theme.css) teaches
//      Tailwind about host-owned tokens (`--color-background`,
//      `--color-foreground`, etc.) so widgets compile classes like
//      `bg-foreground/20`, `text-muted`, `rounded-xl`. The `inline` keyword
//      means the widget's CSS does NOT redefine the underlying
//      `--background`/`--foreground` variables — those stay host-owned and
//      the widget picks them up from `:root` at runtime.
//   3. Tailwind's auto-detection treats `.moi/` as a hidden directory
//      and skips it. An explicit `@source` bypasses the dot-dir + gitignore
//      filters.
//
// Important: the synthetic CSS must live on disk in the `file` namespace
// because `bun-plugin-tailwind`'s `onLoad` only matches that namespace —
// custom-namespace CSS is treated as raw text and our `@theme inline` block
// is left unprocessed. We materialize it inside `<moiRoot>/.build/` and
// have the entry import it by absolute path.
async function writeSyntheticTailwindCss(widgetPath: string, moiRoot: string): Promise<string> {
  const sourceDir = dirname(widgetPath)
  const buildDir = join(moiRoot, '.build')
  const cssPath = join(buildDir, 'widget-tailwind.css')
  const contents = [
    `@import 'tailwindcss';`,
    await Bun.file(HOST_THEME_PATH).text(),
    `@source "${sourceDir}";`
  ].join('\n')
  await Bun.write(cssPath, contents)
  return cssPath
}

function widgetEntryPlugin(widgetPath: string, syntheticCssPath: string): BunPlugin {
  return {
    name: 'widget-entry',
    setup(build) {
      build.onResolve({ filter: /^__widget-entry$/ }, () => ({
        path: '__widget-entry',
        namespace: 'widget-entry'
      }))

      build.onLoad({ filter: /.*/, namespace: 'widget-entry' }, () => ({
        contents: [
          `import ${JSON.stringify(syntheticCssPath)};`,
          `export { default } from ${JSON.stringify(widgetPath)};`
        ].join('\n'),
        loader: 'js'
      }))
    }
  }
}

function injectCss(js: string, css: string, widgetName: string): string {
  if (!css.trim()) return js

  // After `moi bundle` rebuilds the widget, the new JS module re-runs in the
  // browser. Always replace any prior <style data-widget="<id>"> tag so the
  // freshly-built CSS takes effect; the previous "skip if already present"
  // guard left stale rules in place after edits.
  const injection = [
    `((css, id) => {`,
    `  document.querySelector(\`style[data-widget="\${id}"]\`)?.remove();`,
    `  const s = document.createElement("style");`,
    `  s.dataset.widget = id;`,
    `  s.textContent = css;`,
    `  document.head.appendChild(s);`,
    `})(${JSON.stringify(css)}, ${JSON.stringify(widgetName)});`
  ].join('\n')

  return injection + '\n' + js
}

function formatBuildLog(log: BuildMessage | ResolveMessage): string {
  const prefix = log.level === 'error' ? 'error' : log.level
  const loc = log.position
    ? `${log.position.file}:${log.position.line}:${log.position.column}: `
    : ''
  const lineText = log.position?.lineText ? `\n    ${log.position.lineText.trim()}` : ''
  return `${loc}${prefix}: ${log.message}${lineText}`
}

// Relative `.server` import specifiers in a widget source, `.server` suffix
// stripped: `./hello`, `../lib/db`. Shared by prevalidation here and the
// rebuild staleness check in widgets.ts.
export function scanServerImports(source: string): string[] {
  const importPattern = /from\s+['"](\.\.?\/[^'"]+?)\.server(?:\.ts)?['"]/g
  const specifiers: string[] = []
  let match
  while ((match = importPattern.exec(source)) !== null) {
    specifiers.push(match[1])
  }
  return specifiers
}

async function prevalidateServerFiles(entrypoint: string): Promise<void> {
  const sourceDir = dirname(entrypoint)
  const source = await Bun.file(entrypoint).text()

  for (const specifier of scanServerImports(source)) {
    const serverPath = join(sourceDir, `${specifier}.server.ts`)
    if (await Bun.file(serverPath).exists()) {
      await validateServerExports(serverPath)
    }
  }
}

// `moiRoot` is the directory server-module keys are relative to (the
// workspace's `.moi/`). Defaults to the widget's own directory, which keeps
// basename keys for callers that build a file directly (tests, fixtures).
export async function buildWidget(
  entrypoint: string,
  moiRoot = dirname(entrypoint)
): Promise<WidgetArtifact> {
  const sourceDir = dirname(entrypoint)
  const widgetName = basename(entrypoint).replace(/\.tsx?$/, '')

  await prevalidateServerFiles(entrypoint)

  const { plugin: serverProxy, serverModules } = serverProxyPlugin(sourceDir, moiRoot)
  const syntheticCssPath = await writeSyntheticTailwindCss(entrypoint, moiRoot)

  let result: Awaited<ReturnType<typeof Bun.build>>
  try {
    result = await Bun.build({
      entrypoints: ['__widget-entry'],
      format: 'esm',
      target: 'browser',
      sourcemap: 'inline',
      external: EXTERNAL_MODULES,
      // bun-plugin-tailwind uses `build.config.root` as the auto-detect
      // project root (`projectRoot = build.config?.root ?? process.cwd()`).
      // Without this, oxide scans `none-computer/` (the parent server's
      // cwd) instead of the workspace's `.moi/widgets/`.
      root: sourceDir,
      plugins: [widgetEntryPlugin(entrypoint, syntheticCssPath), serverProxy, tailwind]
    })
  } catch (err) {
    // Bun.build throws AggregateError on failure (default throw: true).
    // The message is a generic "Bundle failed"; the real diagnostics live on `.errors`.
    const logs = (err as { errors?: (BuildMessage | ResolveMessage)[] }).errors ?? []
    const formatted = logs.length
      ? logs.map(formatBuildLog).join('\n')
      : err instanceof Error
        ? err.message
        : String(err)
    throw new Error(`Build failed for "${widgetName}":\n${formatted}`)
  }

  if (!result.success) {
    const errors = result.logs.map(formatBuildLog).join('\n')
    throw new Error(`Build failed for "${widgetName}":\n${errors}`)
  }

  const jsOutput = result.outputs.find(o => o.path.endsWith('.js'))
  const cssOutput = result.outputs.find(o => o.path.endsWith('.css'))

  if (!jsOutput) {
    throw new Error(`Build produced no JS output for "${widgetName}"`)
  }

  let js = await jsOutput.text()

  if (cssOutput) {
    const css = await cssOutput.text()
    js = injectCss(js, css, widgetName)
  }

  const config = await extractWidgetConfig(entrypoint)
  return { js, serverModules, config }
}
