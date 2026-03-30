import type {
  ExportNamedDeclaration,
  VariableDeclarator
} from '@typescript-eslint/types/dist/generated/ast-spec'
import { parse } from '@typescript-eslint/typescript-estree'
import type { BunPlugin } from 'bun'
import tailwind from 'bun-plugin-tailwind'
import { basename, dirname, join } from 'path'

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
  const init = decl?.init
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
    const res = await fetch("/_mei/fn/" + module + "/" + name, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: stringify(args),
    });
    if (!res.ok) throw new Error(await res.text());
    return parse(await res.text());
  };
}
`

function serverProxyPlugin(sourceDir: string): {
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

      // Intercept .server imports
      build.onResolve({ filter: /\.server(\.ts)?$/ }, args => {
        if (!args.path.startsWith('.')) return
        return {
          path: join(sourceDir, args.path.replace(/\.server(\.ts)?$/, '.server.ts')),
          namespace: 'server-proxy'
        }
      })

      // Generate proxy stubs using mei:rpc
      build.onLoad({ filter: /.*/, namespace: 'server-proxy' }, async args => {
        const exports = await validateServerExports(args.path)
        const moduleName = basename(args.path, '.server.ts')

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

function widgetEntryPlugin(widgetPath: string): BunPlugin {
  return {
    name: 'widget-entry',
    setup(build) {
      build.onResolve({ filter: /^__widget-entry$/ }, () => ({
        path: '__widget-entry',
        namespace: 'widget-entry'
      }))

      build.onLoad({ filter: /.*/, namespace: 'widget-entry' }, () => ({
        contents: [
          `import "widget-tailwind.css";`,
          `export { default } from ${JSON.stringify(widgetPath)};`
        ].join('\n'),
        loader: 'js'
      }))

      build.onResolve({ filter: /^widget-tailwind\.css$/ }, () => ({
        path: join(widgetPath, '..', 'widget-tailwind.css'),
        namespace: 'widget-tw'
      }))

      build.onLoad({ filter: /.*/, namespace: 'widget-tw' }, () => ({
        contents: `@import 'tailwindcss/theme';\n@import 'tailwindcss/utilities';`,
        loader: 'css'
      }))
    }
  }
}

function injectCss(js: string, css: string, widgetName: string): string {
  if (!css.trim()) return js

  const injection = [
    `((css, id) => {`,
    `  if (document.querySelector(\`style[data-widget="\${id}"]\`)) return;`,
    `  const s = document.createElement("style");`,
    `  s.dataset.widget = id;`,
    `  s.textContent = css;`,
    `  document.head.appendChild(s);`,
    `})(${JSON.stringify(css)}, ${JSON.stringify(widgetName)});`
  ].join('\n')

  return injection + '\n' + js
}

async function prevalidateServerFiles(entrypoint: string): Promise<void> {
  const sourceDir = dirname(entrypoint)
  const source = await Bun.file(entrypoint).text()

  const importPattern = /from\s+['"]\.\/([^'"]+)\.server(?:\.ts)?['"]/g
  let match
  while ((match = importPattern.exec(source)) !== null) {
    const serverPath = join(sourceDir, `${match[1]}.server.ts`)
    if (await Bun.file(serverPath).exists()) {
      await validateServerExports(serverPath)
    }
  }
}

export async function buildWidget(entrypoint: string): Promise<WidgetArtifact> {
  const sourceDir = dirname(entrypoint)
  const widgetName = basename(entrypoint).replace(/\.tsx?$/, '')

  await prevalidateServerFiles(entrypoint)

  const { plugin: serverProxy, serverModules } = serverProxyPlugin(sourceDir)

  const result = await Bun.build({
    entrypoints: ['__widget-entry'],
    format: 'esm',
    target: 'browser',
    sourcemap: 'inline',
    external: EXTERNAL_MODULES,
    plugins: [widgetEntryPlugin(entrypoint), serverProxy, tailwind]
  })

  if (!result.success) {
    const errors = result.logs.map(l => l.message).join('\n')
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
