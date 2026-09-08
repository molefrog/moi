import { existsSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'

import type { AppletSelector } from '@/lib/applet-selector'

import { writeAppletEnvDts } from './moi-scaffold'

export type AppletTypecheckResult = {
  files: string[]
  diagnostics: readonly ts.Diagnostic[]
}

const PACKAGE_TYPE_ROOT = join(import.meta.dir, '..', 'node_modules', '@types')
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
      typeRoots: [join(moiRoot, 'node_modules', '@types'), PACKAGE_TYPE_ROOT],
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
