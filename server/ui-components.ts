// The `moi ui-components` catalog and local registry loader. Component sources
// and docs are bundled, so installs do not depend on a remote registry.
import { join } from 'path'

import registry from '../registry.json'
import { PACKAGE_ROOT } from './version'

// ---------------------------------------------------------------------------
// The curated catalog
// ---------------------------------------------------------------------------

export type UiComponentEntry = {
  // One line for `moi ui-components list` and the skill cheat sheet.
  description: string
}

type RegistryCatalogItem = {
  name: string
  type: string
  files?: Array<{ path: string }>
  registryDependencies?: string[]
}

const REGISTRY_ITEMS = new Map(
  (registry.items as RegistryCatalogItem[]).map(item => [item.name, item] as const)
)

export const UI_COMPONENTS: Record<string, UiComponentEntry> = Object.fromEntries(
  registry.items
    .filter(item => item.type === 'registry:ui' || item.type === 'registry:block')
    .map(item => [item.name, { description: item.description ?? item.title ?? item.name }] as const)
    .sort(([a], [b]) => a.localeCompare(b))
)

export const UI_COMPONENT_NAMES = Object.keys(UI_COMPONENTS)

// The final path segment names the component file for built-in, namespaced,
// and GitHub registry addresses alike.
export function registryItemName(registryItem: string): string {
  const withoutRef = registryItem.split('#', 1)[0]
  return withoutRef.split('/').at(-1) ?? withoutRef
}

// A block has no source of its own, so its direct component dependencies are
// the files users install and can later update with --force.
export function uiComponentFiles(name: string): string[] {
  const files = new Set<string>()
  const visited = new Set<string>()

  const collect = (itemName: string): void => {
    if (visited.has(itemName)) return
    visited.add(itemName)

    const item = REGISTRY_ITEMS.get(itemName)
    if (!item) return
    if (item.files?.length) {
      for (const file of item.files) files.add(uiFileName(file.path))
      return
    }
    for (const dependency of item.registryDependencies ?? []) {
      collect(registryItemName(dependency))
    }
  }

  collect(registryItemName(name))
  return [...files]
}

export type LoadedUiFile = {
  // File name inside `.moi/ui/` (`button.tsx`, `utils.ts`).
  name: string
  content: string
}

export type LoadedUiComponents = {
  files: LoadedUiFile[]
  // npm dependencies declared by the resolved registry items (versioned
  // specifiers like `recharts@3.8.0` pass through as-is).
  dependencies: string[]
}

function uiFileName(registryPath: string): string {
  const base = registryPath.split('/').pop() ?? registryPath
  return base
}

// Load requested items and their same-repository dependencies from the
// bundled registry. Files flatten into `.moi/ui/` so sibling imports
// stay relative.
export async function loadUiComponents(
  registryNames: string[],
  registryRoot: string = PACKAGE_ROOT
): Promise<LoadedUiComponents> {
  const { loadRegistryItem } = await import('shadcn/registry')
  const files = new Map<string, string>()
  const dependencies = new Set<string>()
  const loaded = new Set<string>()

  const loadItem = async (address: string): Promise<void> => {
    const itemName = registryItemName(address)
    if (loaded.has(itemName)) return
    loaded.add(itemName)

    const item = await loadRegistryItem(itemName, { cwd: registryRoot })
    for (const file of item.files ?? []) {
      if (!file.content) {
        throw new Error(`Registry item "${itemName}" has a missing file: ${file.path}`)
      }
      files.set(uiFileName(file.path), file.content)
    }
    for (const dependency of item.dependencies ?? []) dependencies.add(dependency)
    for (const registryDependency of item.registryDependencies ?? []) {
      await loadItem(registryDependency)
    }
  }

  for (const name of new Set(registryNames)) await loadItem(name)

  return {
    files: [...files.entries()].map(([name, content]) => ({ name, content })),
    dependencies: [...dependencies].sort()
  }
}

export async function loadUiComponentDocs(
  registryName: string,
  registryRoot: string = PACKAGE_ROOT
): Promise<string> {
  const itemName = registryItemName(registryName)
  const path = join(registryRoot, 'ui-components', 'docs', `${itemName}.md`)
  const file = Bun.file(path)
  if (!(await file.exists())) throw new Error(`Missing local docs for "${itemName}": ${path}`)
  return file.text()
}

// ---------------------------------------------------------------------------
// Name resolution + write planning (pure — covered by tests)
// ---------------------------------------------------------------------------

export type ResolvedRequest = {
  // Registry items requested, validated and deduplicated.
  entries: string[]
  unknown: string[]
}

export function resolveUiComponentRequest(names: string[]): ResolvedRequest {
  const entries: string[] = []
  const unknown: string[] = []

  for (const raw of names) {
    const name = raw.toLowerCase()
    const entry = UI_COMPONENTS[name]
    if (!entry) {
      unknown.push(raw)
      continue
    }
    if (entries.includes(name)) continue
    entries.push(name)
  }

  return { entries, unknown }
}

// Closest catalog names for a typo, by shared-prefix + substring heuristics —
// enough for `alert-dialog` vs `alertdialog` and singular/plural slips.
export function suggestUiComponents(name: string, limit = 3): string[] {
  const needle = name.toLowerCase().replace(/[^a-z0-9]/g, '')
  const scored = UI_COMPONENT_NAMES.map(candidate => {
    const flat = candidate.replace(/[^a-z0-9]/g, '')
    let score = 0
    if (flat === needle) score = 100
    else if (flat.startsWith(needle) || needle.startsWith(flat)) score = 80
    else if (flat.includes(needle) || needle.includes(flat)) score = 60
    else {
      let common = 0
      while (common < Math.min(flat.length, needle.length) && flat[common] === needle[common]) {
        common++
      }
      score = common >= 3 ? common * 10 : 0
    }
    return { candidate, score }
  })
  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => s.candidate)
}

export type PlannedWrite = {
  name: string
  path: string
  content: string
  // Whether a file already exists at the target path.
  exists: boolean
  // Support files ride along with a request (utils, applet-portal, registry
  // deps of a requested component). Existing support files are never
  // overwritten — they may carry hand customizations; existing requested
  // files fail the add unless --force.
  support: boolean
}

export type UiWritePartition = {
  // Files to write now: everything new, plus existing requested files under
  // --force. Existing support files are never here.
  write: PlannedWrite[]
  // Existing support files, always left untouched.
  keepSupport: PlannedWrite[]
  // Requested components already installed, skipped without --force — a bulk
  // add proceeds past them instead of failing the whole batch.
  skipInstalled: PlannedWrite[]
}

export function partitionUiWrites(plans: PlannedWrite[], force: boolean): UiWritePartition {
  const requested = plans.filter(plan => !plan.support)
  const skipInstalled = force ? [] : requested.filter(plan => plan.exists)
  return {
    write: plans.filter(plan => !plan.exists || (force && !plan.support)),
    keepSupport: plans.filter(plan => plan.support && plan.exists),
    skipInstalled
  }
}

export function planUiWrites(opts: {
  files: LoadedUiFile[]
  requestedFiles: string[]
  uiDir: string
  exists: (path: string) => boolean
}): PlannedWrite[] {
  const requested = new Set(opts.requestedFiles)
  const plans: PlannedWrite[] = opts.files.map(file => {
    const path = join(opts.uiDir, file.name)
    return {
      ...file,
      path,
      exists: opts.exists(path),
      support: !requested.has(file.name)
    }
  })
  return plans
}
