// The `moi ui-components` catalog and local registry loader. Component sources
// and docs are bundled, so installs do not depend on a remote registry.
import { join } from 'path'

import { PACKAGE_ROOT } from './version'

// ---------------------------------------------------------------------------
// The curated catalog
// ---------------------------------------------------------------------------

export type UiComponentEntry = {
  // One line for `moi ui-components list` and the skill cheat sheet.
  description: string
  // Registry items `add` actually loads. Most entries map to themselves;
  // pattern entries (data-table, date-picker) map to their building blocks
  // and exist only as bundled docs.
  registryItems: string[]
  // npm packages the entry needs that no loaded registry item declares —
  // pattern-only additions their docs assume (data-table → TanStack Table).
  // Everything else flows from the resolved items' own `dependencies`.
  extraDeps?: string[]
}

// The agreed subset (UI component review, Aug 2026). Upstream ships ~63 ui
// items; only these are exposed. Registry dependencies of a curated item
// (e.g. field → label + separator, chart → card, toggle-group → toggle) are
// resolved and written implicitly — they are support files, not catalog
// entries.
export const UI_COMPONENTS: Record<string, UiComponentEntry> = {
  accordion: {
    description: 'Vertically stacked sections that expand one at a time',
    registryItems: ['accordion']
  },
  alert: {
    description: 'Callout box for statuses and short messages',
    registryItems: ['alert']
  },
  'alert-dialog': {
    description: 'Modal confirmation dialog for destructive or blocking actions',
    registryItems: ['alert-dialog']
  },
  attachment: {
    description: 'File or image attachment tile with metadata and actions',
    registryItems: ['attachment']
  },
  avatar: {
    description: 'User or entity image with fallback initials',
    registryItems: ['avatar']
  },
  badge: {
    description: 'Small status or count label',
    registryItems: ['badge']
  },
  bubble: {
    description: 'Chat message bubble',
    registryItems: ['bubble']
  },
  button: {
    description: 'The button: variants, sizes, icon support',
    registryItems: ['button']
  },
  'button-group': {
    description: 'Buttons joined into one segmented control',
    registryItems: ['button-group']
  },
  calendar: {
    description: 'Month calendar for picking dates and ranges',
    registryItems: ['calendar']
  },
  carousel: {
    description: 'Swipeable slides with prev/next controls',
    registryItems: ['carousel']
  },
  chart: {
    description: 'Recharts-based charts wired to workspace theme tokens',
    registryItems: ['chart']
  },
  checkbox: {
    description: 'Binary checkbox with indeterminate state',
    registryItems: ['checkbox']
  },
  collapsible: {
    description: 'Single section that expands and collapses',
    registryItems: ['collapsible']
  },
  combobox: {
    description: 'Text input with a filtered dropdown of options',
    registryItems: ['combobox']
  },
  'context-menu': {
    description: 'Right-click menu with items, submenus, and shortcuts',
    registryItems: ['context-menu']
  },
  'data-table': {
    description: 'Sortable, filterable table pattern built on table + TanStack Table',
    registryItems: ['table'],
    extraDeps: ['@tanstack/react-table']
  },
  'date-picker': {
    description: 'Date picker pattern: calendar in a popover',
    registryItems: ['calendar', 'popover', 'button']
  },
  dialog: {
    description: 'Modal dialog with backdrop, header, and footer',
    registryItems: ['dialog']
  },
  drawer: {
    description: 'Right-side detail panel scoped to the current view',
    registryItems: ['drawer']
  },
  'dropdown-menu': {
    description: 'Menu opened from a trigger: items, groups, submenus',
    registryItems: ['dropdown-menu']
  },
  field: {
    description: 'Form field wrapper: label, control, description, error',
    registryItems: ['field']
  },
  'hover-card': {
    description: 'Preview card shown on hover over a link or element',
    registryItems: ['hover-card']
  },
  input: {
    description: 'Single-line text input',
    registryItems: ['input']
  },
  'input-group': {
    description: 'Input with attached addons, buttons, or icons',
    registryItems: ['input-group']
  },
  label: {
    description: 'Form control label',
    registryItems: ['label']
  },
  pagination: {
    description: 'Page navigation with prev/next and page links',
    registryItems: ['pagination']
  },
  popover: {
    description: 'Floating panel anchored to a trigger',
    registryItems: ['popover']
  },
  progress: {
    description: 'Determinate progress bar',
    registryItems: ['progress']
  },
  'radio-group': {
    description: 'Single-choice radio button set',
    registryItems: ['radio-group']
  },
  resizable: {
    description: 'Resizable split panels with drag handles',
    registryItems: ['resizable']
  },
  select: {
    description: 'Native-feeling select with a styled popup',
    registryItems: ['select']
  },
  separator: {
    description: 'Horizontal or vertical dividing line',
    registryItems: ['separator']
  },
  skeleton: {
    description: 'Loading placeholder block',
    registryItems: ['skeleton']
  },
  slider: {
    description: 'Range slider with one or more thumbs',
    registryItems: ['slider']
  },
  spinner: {
    description: 'Inline loading spinner',
    registryItems: ['spinner']
  },
  switch: {
    description: 'On/off toggle switch',
    registryItems: ['switch']
  },
  table: {
    description: 'Styled table primitives (header, body, rows, cells)',
    registryItems: ['table']
  },
  tabs: {
    description: 'Tabbed panels with a tab list',
    registryItems: ['tabs']
  },
  textarea: {
    description: 'Multi-line text input',
    registryItems: ['textarea']
  },
  'toggle-group': {
    description: 'Group of two-state toggle buttons',
    registryItems: ['toggle-group']
  },
  tooltip: {
    description: 'Small label shown on hover or focus',
    registryItems: ['tooltip']
  }
}

export const UI_COMPONENT_NAMES = Object.keys(UI_COMPONENTS)

// The final path segment names the component file for built-in, namespaced,
// and GitHub registry addresses alike.
export function registryItemName(registryItem: string): string {
  const withoutRef = registryItem.split('#', 1)[0]
  return withoutRef.split('/').at(-1) ?? withoutRef
}

// The `.tsx` files in `.moi/ui/` whose presence makes an entry count as
// installed.
export function uiComponentFiles(name: string): string[] {
  const entry = UI_COMPONENTS[name]
  return entry.registryItems.map(item => `${registryItemName(item)}.tsx`)
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
  const registryPath = join(registryRoot, 'registry.json')
  if (!(await Bun.file(registryPath).exists())) {
    throw new Error(`Missing local registry: ${registryPath}`)
  }

  const { loadRegistry, loadRegistryItem } = await import('shadcn/registry')
  const registry = await loadRegistry({ cwd: registryRoot })
  const available = new Set(registry.items.map(item => item.name))
  const files = new Map<string, string>()
  const dependencies = new Set<string>()
  const loaded = new Set<string>()

  const loadItem = async (address: string): Promise<void> => {
    const itemName = registryItemName(address)
    if (loaded.has(itemName)) return
    if (!available.has(itemName)) {
      throw new Error(`Registry item "${itemName}" is missing from the local registry`)
    }
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
  // Curated entries requested, validated.
  entries: string[]
  // Registry items to load (patterns expanded), deduplicated, in request order.
  registryItems: string[]
  // Union of extraDeps across the requested entries.
  extraDeps: string[]
  unknown: string[]
}

export function resolveUiComponentRequest(names: string[]): ResolvedRequest {
  const entries: string[] = []
  const registryItems: string[] = []
  const extraDeps = new Set<string>()
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
    for (const item of entry.registryItems) {
      if (!registryItems.includes(item)) registryItems.push(item)
    }
    for (const dep of entry.extraDeps ?? []) extraDeps.add(dep)
  }

  return { entries, registryItems, extraDeps: [...extraDeps].sort(), unknown }
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
  // Every requested file already exists and --force is off: the add would be
  // a no-op, so the CLI fails loudly instead of quietly keeping everything.
  allInstalled: boolean
}

export function partitionUiWrites(plans: PlannedWrite[], force: boolean): UiWritePartition {
  const requested = plans.filter(plan => !plan.support)
  const skipInstalled = force ? [] : requested.filter(plan => plan.exists)
  return {
    write: plans.filter(plan => !plan.exists || (force && !plan.support)),
    keepSupport: plans.filter(plan => plan.support && plan.exists),
    skipInstalled,
    allInstalled: !force && requested.length > 0 && skipInstalled.length === requested.length
  }
}

export function planUiWrites(opts: {
  files: LoadedUiFile[]
  requestedItems: string[]
  uiDir: string
  exists: (path: string) => boolean
}): PlannedWrite[] {
  const requested = new Set(opts.requestedItems.map(item => `${registryItemName(item)}.tsx`))
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
