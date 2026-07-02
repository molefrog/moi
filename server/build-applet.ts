import type {
  ExportNamedDeclaration,
  VariableDeclarator
} from '@typescript-eslint/types/dist/generated/ast-spec'
import { parse } from '@typescript-eslint/typescript-estree'
import type { BunPlugin } from 'bun'
import tailwind from 'bun-plugin-tailwind'
import { realpathSync } from 'node:fs'
import { basename, dirname, join, relative, sep } from 'path'

import type { ViewConfig, WidgetConfig } from '@/lib/types'

// An **applet** is any custom UI unit embedded in a workspace; `widget` and
// `view` are its kinds (more may follow). All compile through this pipeline —
// `kind` only diverges at the edges: which `config` schema is parsed, the
// synthetic-CSS filename, and the injected `<style>` id namespace.
export type AppletKind = 'widget' | 'view'

// Baked into the bundle wherever a runtime URL needs the workspace's API base
// (RPC + workspace files). The serve route string-replaces it with the real
// `/api/workspaces/<id>` in every `.js` it returns, so the on-disk bundle stays
// workspace-agnostic. Survives the build because we never minify — it lives as
// a plain string literal. Assets don't use it: they self-locate via
// `import.meta.url` (see the asset loader below).
export const APPLET_API_BASE_SENTINEL = '%%MOI_APPLET_API_BASE%%'

// Extensions an applet may `import` as a bundled asset. Each is emitted as a
// content-hashed sibling of `index.js` and the import resolves to its URL via
// `import.meta.url`. Deliberately images + fonts only: large media (video/audio)
// belongs in the workspace and should stream via `fileUrl()`, not bloat the
// bundle dir.
const ASSET_EXTENSIONS = /\.(png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|otf)$/i

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

// One emitted file in an applet's served directory. `code` files (entry +
// chunks) are sentinel-swapped and served as JS; `asset` files (images/fonts)
// stream raw.
export type AppletFile = {
  name: string
  data: string | Uint8Array
  kind: 'code' | 'asset'
}

export type AppletArtifact = {
  // The entry (`index.js`) source, post CSS-injection — a convenience alias for
  // the `code` file named `index.js` in `files`.
  js: string
  // Everything to write into `.build/<kind>/<name>/`: the entry, any code
  // chunks, and bundled assets.
  files: AppletFile[]
  serverModules: ServerModule[]
  config: WidgetConfig | ViewConfig | null
}

const DEFAULT_CONFIG: WidgetConfig = { rowSpan: 1, colSpan: 2 }
const VALID_SPANS = [1, 2, 3, 4] as const

// The properties of an exported `const config = { … }` object literal, or null
// when the file declares no such export. Shared by the widget and view config
// extractors — they each interpret the properties under their own schema.
function findConfigProperties(source: string) {
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

  return init.properties
}

// `requiredEnv`: an array of string literals naming env vars the bundle needs.
// Advisory only — surfaced in the env UI, never enforced at build/load.
function readRequiredEnv(propValue: unknown): string[] | undefined {
  const value = propValue as { type?: string; elements?: unknown[] }
  if (value?.type !== 'ArrayExpression') return undefined
  const names = (value.elements ?? [])
    .filter(
      (el): el is { type: 'Literal'; value: string } =>
        (el as { type?: string })?.type === 'Literal' &&
        typeof (el as { value?: unknown }).value === 'string'
    )
    .map(el => el.value)
  return names.length ? names : undefined
}

export async function extractWidgetConfig(srcPath: string): Promise<WidgetConfig | null> {
  const source = await Bun.file(srcPath).text()
  const widgetName = basename(srcPath).replace(/\.tsx?$/, '')

  const properties = findConfigProperties(source)
  if (!properties) return null

  const result: Partial<WidgetConfig> = {}

  for (const prop of properties) {
    if (prop.type !== 'Property' || prop.key?.type !== 'Identifier') continue
    const key = prop.key.name as string

    if (key === 'requiredEnv') {
      const names = readRequiredEnv(prop.value)
      if (names) result.requiredEnv = names
      continue
    }

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

// A view's config: just `title` (string) + advisory `requiredEnv`. No sizing —
// views are full-screen. Returns null when no `config` export is present.
export async function extractViewConfig(srcPath: string): Promise<ViewConfig | null> {
  const source = await Bun.file(srcPath).text()

  const properties = findConfigProperties(source)
  if (!properties) return null

  const result: ViewConfig = {}

  for (const prop of properties) {
    if (prop.type !== 'Property' || prop.key?.type !== 'Identifier') continue
    const key = prop.key.name as string

    if (key === 'title') {
      if (prop.value?.type === 'Literal' && typeof prop.value.value === 'string') {
        result.title = prop.value.value
      }
      continue
    }
    if (key === 'requiredEnv') {
      const names = readRequiredEnv(prop.value)
      if (names) result.requiredEnv = names
    }
  }

  return result
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

// The mei:rpc virtual module — contains the RPC call logic with devalue
// serialization. Bundled into the applet output once, shared by all server
// function stubs. The base is the sentinel the serve route rewrites to
// `/api/workspaces/<id>`, so a bundle carries no workspace id of its own.
const RPC_MODULE_SOURCE = `
import { stringify, parse } from "devalue";

const BASE = ${JSON.stringify(APPLET_API_BASE_SENTINEL)};

export function rpc(module, name) {
  return async (...args) => {
    const res = await fetch(BASE + "/rpc/" + module + "/" + name, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: stringify(args),
    });
    if (!res.ok) throw new Error(await res.text());
    return parse(await res.text());
  };
}
`

// The `moi` virtual module — the applet-facing runtime API. Today just
// `fileUrl(path)`, which maps a workspace-relative path to its streaming URL
// (`/api/workspaces/<id>/fs/<path>`). Same sentinel base as RPC; the path is
// per-segment URL-encoded so spaces / unicode in filenames survive. A leading
// slash is stripped so both `clips/a.mp4` and `/clips/a.mp4` work.
const MOI_MODULE_SOURCE = `
const BASE = ${JSON.stringify(APPLET_API_BASE_SENTINEL)};

export function fileUrl(path) {
  const clean = String(path).replace(/^\\/+/, "");
  return BASE + "/fs/" + clean.split("/").map(encodeURIComponent).join("/");
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

// The applet runtime plugin wires the three I/O transports into the bundle:
//   • `.server` imports → RPC stubs (via the `mei:rpc` virtual module)
//   • `moi` import      → the `fileUrl` runtime
//   • asset imports     → content-hashed sibling files, referenced by URL
// It returns the collected server modules (for hot-reload + env aggregation)
// and the asset files the caller must emit next to `index.js`.
function appletRuntimePlugin(
  sourceDir: string,
  moiRoot: string
): {
  plugin: BunPlugin
  serverModules: ServerModule[]
  assets: AppletFile[]
} {
  const serverModules: ServerModule[] = []
  const assets: AppletFile[] = []

  const plugin: BunPlugin = {
    name: 'applet-runtime',
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

      // The `moi` runtime module (fileUrl). A bare specifier, so match it exactly.
      build.onResolve({ filter: /^moi$/ }, () => ({ path: 'moi', namespace: 'moi-runtime' }))
      build.onLoad({ filter: /.*/, namespace: 'moi-runtime' }, () => ({
        contents: MOI_MODULE_SOURCE,
        loader: 'js'
      }))

      // Asset imports (images/fonts): emit a content-hashed sibling and resolve
      // the import to its module-relative URL. Self-locating via import.meta.url,
      // so it needs no API base — the asset sits next to the served entry.
      build.onLoad({ filter: ASSET_EXTENSIONS }, async args => {
        const bytes = new Uint8Array(await Bun.file(args.path).arrayBuffer())
        const hash = Bun.hash(bytes).toString(16).slice(0, 8)
        const dot = args.path.lastIndexOf('.')
        const ext = args.path.slice(dot + 1).toLowerCase()
        const stem = basename(args.path.slice(0, dot)).replace(/[^a-zA-Z0-9_-]/g, '-')
        const name = `${stem}-${hash}.${ext}`
        if (!assets.some(a => a.name === name)) assets.push({ name, data: bytes, kind: 'asset' })
        return {
          contents: `export default new URL(${JSON.stringify('./' + name)}, import.meta.url).href`,
          loader: 'js'
        }
      })

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

  return { plugin, serverModules, assets }
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
async function writeSyntheticTailwindCss(
  widgetPath: string,
  moiRoot: string,
  kind: AppletKind
): Promise<string> {
  const sourceDir = dirname(widgetPath)
  const buildDir = join(moiRoot, '.build')
  // Per-kind filename: widgets (`@source .moi/widgets`) and views
  // (`@source .moi/views`) build concurrently in one `moi bundle`; a shared
  // file would race and point Tailwind at the wrong source dir.
  const cssPath = join(buildDir, `${kind}-tailwind.css`)
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

// Relative asset import specifiers in an applet source (`./logo.png`,
// `../shared/icon.svg`). Used by the rebuild staleness check so editing an
// imported image rebuilds the bundle even when the `.tsx` itself is untouched.
const ASSET_IMPORT_RE =
  /from\s+['"](\.\.?\/[^'"]+?\.(?:png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|otf))['"]/gi
export function scanAssetImports(source: string): string[] {
  const specifiers: string[] = []
  let match
  while ((match = ASSET_IMPORT_RE.exec(source)) !== null) {
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
// workspace's `.moi/`). Defaults to the entrypoint's own directory, which keeps
// basename keys for callers that build a file directly (tests, fixtures).
// `kind` selects the config schema, synthetic-CSS filename, and `<style>` id
// namespace; it defaults to 'widget' so existing callers are unaffected.
export async function buildApplet(
  entrypoint: string,
  moiRoot = dirname(entrypoint),
  kind: AppletKind = 'widget'
): Promise<AppletArtifact> {
  const sourceDir = dirname(entrypoint)
  const widgetName = basename(entrypoint).replace(/\.tsx?$/, '')

  await prevalidateServerFiles(entrypoint)

  const { plugin: runtime, serverModules, assets } = appletRuntimePlugin(sourceDir, moiRoot)
  const syntheticCssPath = await writeSyntheticTailwindCss(entrypoint, moiRoot, kind)

  let result: Awaited<ReturnType<typeof Bun.build>>
  try {
    result = await Bun.build({
      entrypoints: ['__widget-entry'],
      format: 'esm',
      target: 'browser',
      sourcemap: 'inline',
      external: EXTERNAL_MODULES,
      // Always compile to the PRODUCTION automatic JSX runtime (`jsx`/`jsxs`
      // from react/jsx-runtime), making the on-disk bundle mode-agnostic: it
      // runs under both the development and production servers without a rebuild.
      // Both vendored React builds export working `jsx`/`jsxs` — only `jsxDEV`
      // is production-undefined, so the dev transform (Bun's default here, since
      // the widget `root` has no tsconfig) crashes against the production React a
      // prebuilt/global install serves ("jsxDEV is not a function"). This matters
      // because widgets built in one mode (e.g. `bun run dev`) are served as-is
      // in the other (`moi start`) — no source change, so no rebuild is triggered.
      // Dev still gets React's runtime warnings: the vendor route serves the
      // development React, whose `jsx()` validates; only jsxDEV's extra
      // source-location detail is forgone.
      define: {
        'process.env.NODE_ENV': JSON.stringify('production')
      },
      // The bundle is a directory: a fixed `index.js` entry (the client
      // dynamic-imports it) plus content-hashed `chunk-*.js` for any dynamic
      // imports. Assets are emitted by the runtime plugin, not here. `[ext]` is
      // required — bun emits the entry's CSS sibling as an "entry" output too, so
      // a literal `index.js` would collide with the `.css`; we inject that CSS
      // into the JS and drop the file, keeping a clean `index.js`.
      naming: { entry: 'index.[ext]', chunk: 'chunk-[hash].[ext]' },
      // bun-plugin-tailwind uses `build.config.root` as the auto-detect
      // project root (`projectRoot = build.config?.root ?? process.cwd()`).
      // Without this, oxide scans `none-computer/` (the parent server's
      // cwd) instead of the workspace's `.moi/widgets/`.
      root: sourceDir,
      plugins: [widgetEntryPlugin(entrypoint, syntheticCssPath), runtime, tailwind]
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

  const entryOutput = result.outputs.find(o => o.kind === 'entry-point')
  const chunkOutputs = result.outputs.filter(o => o.kind === 'chunk')
  const cssOutput = result.outputs.find(o => o.kind === 'asset' && o.path.endsWith('.css'))

  if (!entryOutput) {
    throw new Error(`Build produced no JS output for "${widgetName}"`)
  }

  let js = await entryOutput.text()

  if (cssOutput) {
    const css = await cssOutput.text()
    // Namespace the injected <style> id by kind so a widget and a view sharing
    // a name don't overwrite each other's rules.
    const styleId = kind === 'widget' ? widgetName : `${kind}:${widgetName}`
    js = injectCss(js, css, styleId)
  }

  const files: AppletFile[] = [{ name: 'index.js', data: js, kind: 'code' }]
  for (const chunk of chunkOutputs) {
    files.push({ name: basename(chunk.path), data: await chunk.text(), kind: 'code' })
  }
  files.push(...assets)

  const config =
    kind === 'view' ? await extractViewConfig(entrypoint) : await extractWidgetConfig(entrypoint)
  return { js, files, serverModules, config }
}
