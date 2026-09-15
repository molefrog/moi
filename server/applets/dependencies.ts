// Local dependency analysis shared by rebuild checks and applet cleanup.
// Each analysis reads files once, follows relative imports only, and is bounded.
// Incomplete graphs mean rebuild for staleness checks and keep helpers for cleanup.
import { readdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

export const MODULE_FILE_RE = /\.[mc]?[jt]sx?$/
const TS_ONLY_FILE_RE = /\.[mc]?ts$/
const MAX_GRAPH_FILES = 256

export type ModuleDependencies = {
  modifiedAt: number
  imports: string[]
}

export type DependencyGraph = {
  entrypoints: Set<string>
  modules: Map<string, ModuleDependencies>
  complete: boolean
}

// Source module names in a kind's directory: `*.tsx`/`*.ts` minus `.server.ts`
// and minus `_`-prefixed files (`_utils.tsx`) — those are shared modules for
// entries to import, never entry points themselves.
export async function scanSources(sourceDir: string): Promise<string[]> {
  try {
    const entries = await readdir(sourceDir)
    return entries
      .filter(f => /\.(tsx|ts)$/.test(f) && !f.startsWith('_') && !f.endsWith('.server.ts'))
      .map(f => f.replace(/\.tsx?$/, ''))
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return []
    throw error
  }
}

export async function resolveSource(sourceDir: string, name: string): Promise<string | null> {
  for (const ext of ['.tsx', '.ts']) {
    const path = join(sourceDir, `${name}${ext}`)
    if (await Bun.file(path).exists()) return path
  }
  return null
}

// Bun lexes static, re-export, side-effect, and literal dynamic imports.
// Type-only imports are erased; bare package specifiers are outside this local graph.
const IMPORT_SCANNERS = {
  ts: new Bun.Transpiler({ loader: 'ts' }),
  tsx: new Bun.Transpiler({ loader: 'tsx' })
}
export function scanRelativeImports(source: string, loader: 'ts' | 'tsx' = 'tsx'): string[] | null {
  let imports: { path: string }[]
  try {
    imports = IMPORT_SCANNERS[loader].scanImports(source)
  } catch {
    return null
  }
  return imports.map(i => i.path).filter(p => /^\.\.?\//.test(p))
}

// Stop as soon as a changed file is found when checking an existing bundle.
// Without modifiedSince, return the whole graph for reachability/cleanup.
export async function analyzeDependencies(
  entrypoints: Iterable<string>,
  modifiedSince = Infinity
): Promise<DependencyGraph> {
  const graph: DependencyGraph = {
    entrypoints: new Set([...entrypoints].map(path => resolve(path))),
    modules: new Map(),
    complete: true
  }
  const queue = [...graph.entrypoints]
  while (queue.length > 0) {
    const path = queue.pop()!
    if (graph.modules.has(path)) continue
    if (graph.modules.size >= MAX_GRAPH_FILES) {
      graph.complete = false
      break
    }
    const module: ModuleDependencies = { modifiedAt: 0, imports: [] }
    graph.modules.set(path, module)
    try {
      const file = Bun.file(path)
      if (!(await file.exists())) {
        graph.complete = false
        continue
      }
      module.modifiedAt = file.lastModified
      if (module.modifiedAt >= modifiedSince) {
        graph.complete = false
        break
      }
      if (!MODULE_FILE_RE.test(path)) continue
      const specifiers = scanRelativeImports(
        await file.text(),
        TS_ONLY_FILE_RE.test(path) ? 'ts' : 'tsx'
      )
      if (!specifiers) {
        graph.complete = false
        continue
      }
      for (const specifier of specifiers) {
        const dependency = await resolveModuleImport(dirname(path), specifier)
        if (!dependency) {
          graph.complete = false
          continue
        }
        module.imports.push(dependency)
        queue.push(dependency)
      }
    } catch {
      graph.complete = false
    }
  }
  return graph
}

// Include unfinished applets and each applet's companion server module: a
// companion can serve RPC calls without an import in the client source.
export async function analyzeAppletDependencies(workspacePath: string): Promise<DependencyGraph> {
  const entrypoints: string[] = []
  for (const kind of ['views', 'widgets']) {
    const directory = join(workspacePath, '.moi', kind)
    for (const name of await scanSources(directory)) {
      for (const extension of ['.tsx', '.ts', '.server.ts']) {
        const path = join(directory, name + extension)
        if (await Bun.file(path).exists()) entrypoints.push(path)
      }
    }
  }
  return analyzeDependencies(entrypoints)
}

// Reachability is an in-memory walk over an already analyzed graph.
export function collectDependencies(
  graph: DependencyGraph,
  entrypoints: Iterable<string>
): Set<string> {
  const files = new Set<string>()
  const queue = [...entrypoints]
  while (queue.length > 0) {
    const path = queue.pop()!
    if (files.has(path)) continue
    files.add(path)
    queue.push(...(graph.modules.get(path)?.imports ?? []))
  }
  return files
}

// Extensions Bun appends to an extensionless import, in its own preference
// order (`./data` finds `data.tsx` before `data.ts` before … `data.json`).
// Doubles as the directory-index set: `./helpers` → `helpers/index.jsx`.
const RESOLVE_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js', '.mjs', '.cjs', '.json', '.mts', '.cts']

// TypeScript's output-extension rewrite: an import written against the emitted
// file name resolves to the source that produces it. (`.cjs` → `.cts` is
// deliberately absent — Bun doesn't do that one.)
const TS_EXTENSION_REWRITES: Record<string, string[]> = {
  '.js': ['.ts', '.tsx'],
  '.jsx': ['.tsx'],
  '.mjs': ['.mts']
}

// Resolve a relative import to the file the bundler will actually read. This
// mirrors Bun's resolution rather than delegating to `Bun.resolveSync`, which
// memoizes results for the life of the process: in the long-running server it
// keeps handing back the path of a dependency that has since been deleted or
// renamed, which is exactly the case this check has to catch. Every candidate
// is probed against the filesystem, in Bun's order — literal path, TS
// extension rewrite, appended extension, then directory (`package.json` main,
// else `index.*`). Returns null when nothing on disk answers the specifier.
async function resolveModuleImport(dir: string, specifier: string): Promise<string | null> {
  const base = join(dir, specifier)
  const candidates = [base]

  // Extension of the final segment only — a dot in a directory name (`./v1.2/x`)
  // is not one.
  const ext = /\.[^./\\]+$/.exec(base)?.[0] ?? ''
  for (const rewrite of TS_EXTENSION_REWRITES[ext] ?? []) {
    candidates.push(base.slice(0, base.length - ext.length) + rewrite)
  }
  for (const e of RESOLVE_EXTENSIONS) candidates.push(base + e)

  for (const candidate of candidates) {
    if (await Bun.file(candidate).exists()) return candidate
  }

  // Directory import. `package.json` main wins over `index.*`, matching Bun;
  // an unreadable or `main`-less manifest just falls through to the indexes.
  const pkg: unknown = await Bun.file(join(base, 'package.json'))
    .json()
    .catch(() => null)
  const main =
    typeof pkg === 'object' && pkg !== null && 'main' in pkg && typeof pkg.main === 'string'
      ? pkg.main
      : null
  if (main) {
    const mainPath = join(base, main)
    if (await Bun.file(mainPath).exists()) return mainPath
  }
  for (const e of RESOLVE_EXTENSIONS) {
    const index = join(base, `index${e}`)
    if (await Bun.file(index).exists()) return index
  }
  return null
}
