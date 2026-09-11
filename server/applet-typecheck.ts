import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import ts from 'typescript'

import type { AppletSelector } from '@/lib/applet-selector'

import { writeAppletEnvDts } from './moi-scaffold'

export type AppletTypecheckResult = {
  files: string[]
  diagnostics: readonly ts.Diagnostic[]
}

// Bun's ambient types come from the `@types/bun` moi itself depends on — the
// version moi was tested with, present wherever moi runs. It is found through
// Bun's resolver from moi's own location rather than a fixed path: `bun
// install -g` hoists moi's dependencies beside the package, so
// `../node_modules/@types` only exists in a dev checkout, and TypeScript never
// falls back to node_modules for `types` entries once `typeRoots` is set. The
// same root serves the `bun-types` and `@types/node` references inside, so
// the workspace's own `node_modules` never takes part. `from` is injectable
// for tests.
export function resolvePackageTypeRoot(from: string = import.meta.dir): string {
  try {
    return dirname(dirname(Bun.resolveSync('@types/bun/package.json', from)))
  } catch {
    throw new Error("moi's bundled @types/bun is missing — reinstall moi-computer")
  }
}

const TYPESCRIPT_FILES = new Bun.Glob('**/*.{ts,tsx}')

async function collectTypeScriptFiles(directory: string): Promise<string[]> {
  if (!existsSync(directory)) return []
  const files = await Array.fromAsync(TYPESCRIPT_FILES.scan({ cwd: directory, onlyFiles: true }))
  return files.map(file => join(directory, file)).sort()
}

async function collectAppletFiles(directory: string, id: string): Promise<string[]> {
  const entrypoint = [`${id}.tsx`, `${id}.ts`].map(file => join(directory, file)).find(existsSync)
  if (!entrypoint) return []

  const server = join(directory, `${id}.server.ts`)
  return existsSync(server) ? [entrypoint, server] : [entrypoint]
}

export async function typecheckApplets(
  workspaceRoot: string,
  scope?: AppletSelector
): Promise<AppletTypecheckResult> {
  const moiRoot = join(workspaceRoot, '.moi')
  const [kind, id] = scope?.split('/') ?? []
  const files = id
    ? await collectAppletFiles(join(moiRoot, kind), id)
    : (
        await Promise.all(
          (kind ? [kind] : ['widgets', 'views']).map(directory =>
            collectTypeScriptFiles(join(moiRoot, directory))
          )
        )
      )
        .flat()
        .sort()
  if (files.length === 0) return { files, diagnostics: [] }

  await writeAppletEnvDts(workspaceRoot)
  const program = ts.createProgram({
    rootNames: [join(moiRoot, 'applet-env.d.ts'), ...files],
    options: {
      allowImportingTsExtensions: true,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      lib: ['lib.esnext.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      noEmit: true,
      resolveJsonModule: true,
      skipLibCheck: true,
      strict: true,
      target: ts.ScriptTarget.ESNext,
      typeRoots: [resolvePackageTypeRoot()],
      types: ['bun']
    }
  })

  return { files, diagnostics: ts.getPreEmitDiagnostics(program) }
}

export function formatAppletTypecheckDiagnostics(diagnostics: readonly ts.Diagnostic[]): string {
  return ts.formatDiagnosticsWithColorAndContext([...diagnostics], {
    getCanonicalFileName: fileName => fileName,
    getCurrentDirectory: () => process.cwd(),
    getNewLine: () => '\n'
  })
}
