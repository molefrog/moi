// The `moi ui-components` engine: a shadcn-lite proxy over the `shadcn`
// package's own programmatic registry + transform APIs (see docs/ui-components.md
// for the full spec and the research trail in PR #78).
//
// Opinions, enforced here: moi-authored components come from the source
// registry bundled with the package, while standard components fall back to
// the upstream registry (style `base-nova`, Base UI primitives, Tabler icons).
// The command exposes only a curated subset of both. No config files ever land
// in the workspace —
// the engine takes its config as the in-memory object below; components are
// written to `.moi/ui/` and imported relatively (`../ui/button`). The command
// writes source files and nothing else: it never installs dependencies and
// never rebuilds — it prints next steps for the agent instead.
// `shadcn/registry`, `shadcn/utils` and `ts-morph` are imported at their call
// sites rather than here, deliberately. Together they are ~31 MB of JS across
// 1600 modules (ts-morph alone embeds the whole TypeScript compiler), and the
// cost is parse + top-level evaluation, so bundling does not help — measured
// at ~300 ms. Only `moi ui-components add` and registry-backed docs load this
// machinery; a static import here made every `moi` command pay it, `moi
// version` included.
import type { Project, SourceFile } from 'ts-morph'
import { join } from 'path'

import { PACKAGE_ROOT } from './version'

// ---------------------------------------------------------------------------
// The curated catalog
// ---------------------------------------------------------------------------

export type UiComponentEntry = {
  // One line for `moi ui-components list` and the skill cheat sheet.
  description: string
  // Registry items `add` actually fetches. Most entries map to themselves;
  // pattern entries (data-table, date-picker) map to their building blocks
  // and exist upstream only as docs.
  registryItems: string[]
  // npm packages the entry needs that no fetched registry item declares —
  // pattern-only additions their docs assume (data-table → TanStack Table).
  // Everything else flows from the resolved items' own `dependencies`.
  extraDeps?: string[]
  // Docs slug when it differs from the entry name (none currently).
  docsSlug?: string
  // Load docs from the entry's registry item instead of the upstream docs
  // site. Used by moi-authored components such as Drawer.
  docs?: 'registry'
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
    registryItems: ['button'],
    docs: 'registry'
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
    registryItems: ['drawer'],
    docs: 'registry'
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

// ---------------------------------------------------------------------------
// Engine config — the in-memory replacement for components.json
// ---------------------------------------------------------------------------

// The whole point of driving the engine programmatically: this object stays
// inside moi and the workspace never grows a components.json or tsconfig.
// Aliases are placeholders the engine requires but never applies — raw
// registry content hardcodes `@/registry/<style>/…` specifiers, which
// rewriteRegistryImports below maps to relative paths.
// Cast once to `never`: the engine functions accept `Partial<Config>`, but
// shadcn exports no public name for that resolved Config type (only the
// components.json shape) — `never` is assignable to every parameter type, and
// nothing here reads the constant back.
const ENGINE_CONFIG = {
  style: 'base-nova',
  tailwind: { css: 'unused.css', baseColor: 'neutral', cssVariables: true },
  rsc: false,
  tsx: true,
  iconLibrary: 'tabler',
  rtl: false,
  aliases: { ui: '@/components/ui', utils: '@/lib/utils' }
} as never

export const UI_DOCS_BASE = 'https://ui.shadcn.com/docs/components/base'

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------

export type FetchedUiFile = {
  // File name inside `.moi/ui/` (`button.tsx`, `utils.ts`).
  name: string
  content: string
}

export type FetchedUiComponents = {
  files: FetchedUiFile[]
  // npm dependencies declared by the resolved registry items (versioned
  // specifiers like `recharts@3.8.0` pass through as-is).
  dependencies: string[]
}

export type FetchUiComponentsOptions = {
  registryRoot?: string
  resolveRemote?: (registryNames: string[]) => Promise<FetchedUiComponents>
}

// Where a registry file lands in `.moi/ui/`. Registry paths look like
// `registry/base-nova/ui/button.tsx`, `registry/base-nova/lib/utils.ts`,
// `registry/base-nova/hooks/use-mobile.ts` — everything flattens into the one
// ui dir so relative imports stay `./<name>`.
function uiFileName(registryPath: string): string {
  const base = registryPath.split('/').pop() ?? registryPath
  return base
}

async function fetchRemoteUiComponents(registryNames: string[]): Promise<FetchedUiComponents> {
  const { resolveRegistryItems } = await import('shadcn/registry')
  const tree = await resolveRegistryItems([...new Set(['utils', ...registryNames])], {
    config: ENGINE_CONFIG
  })
  if (!tree) throw new Error(`Could not resolve registry items: ${registryNames.join(', ')}`)

  const files = new Map<string, string>()
  for (const file of tree.files ?? []) {
    if (file.content) files.set(uiFileName(file.path), file.content)
  }

  return {
    files: [...files.entries()].map(([name, content]) => ({ name, content })),
    dependencies: [...new Set(tree.dependencies ?? [])].sort()
  }
}

async function localRegistryNames(registryRoot: string): Promise<Set<string>> {
  if (!(await Bun.file(join(registryRoot, 'registry.json')).exists())) return new Set()
  const { loadRegistry } = await import('shadcn/registry')
  const registry = await loadRegistry({ cwd: registryRoot })
  return new Set(registry.items.map(item => item.name))
}

// Fetch requested items from the registry shipped with moi first. Local
// registry dependencies stay local, and a local component replaces the same
// file when it arrives as support for an upstream item.
export async function fetchUiComponents(
  registryNames: string[],
  options: FetchUiComponentsOptions = {}
): Promise<FetchedUiComponents> {
  const registryRoot = options.registryRoot ?? PACKAGE_ROOT
  const names = [...new Set(registryNames)]
  const localItemNames = await localRegistryNames(registryRoot)
  const files = new Map<string, string>()
  const dependencies = new Set<string>()
  const loadedLocalItems = new Set<string>()
  const remote: string[] = []
  const { loadRegistryItem } = await import('shadcn/registry')

  const addRemote = (name: string) => {
    if (!remote.includes(name)) remote.push(name)
  }

  const loadLocalItem = async (name: string): Promise<boolean> => {
    const itemName = registryItemName(name)
    if (!localItemNames.has(itemName)) return false
    if (loadedLocalItems.has(itemName)) return true
    loadedLocalItems.add(itemName)

    const item = await loadRegistryItem(itemName, { cwd: registryRoot })
    for (const file of item.files ?? []) {
      if (file.content) files.set(uiFileName(file.path), file.content)
    }
    for (const dependency of item.dependencies ?? []) dependencies.add(dependency)
    for (const registryDependency of item.registryDependencies ?? []) {
      if (!(await loadLocalItem(registryDependency))) addRemote(registryDependency)
    }
    return true
  }

  for (const name of names) {
    if (!(await loadLocalItem(name))) addRemote(name)
  }

  if (remote.length > 0) {
    const resolveRemote = options.resolveRemote ?? fetchRemoteUiComponents
    const resolved = await resolveRemote(remote)

    for (const file of resolved.files) {
      const itemName = file.name.endsWith('.tsx') ? file.name.slice(0, -4) : ''
      if (localItemNames.has(itemName)) await loadLocalItem(itemName)
      if (!files.has(file.name)) files.set(file.name, file.content)
    }
    for (const dependency of resolved.dependencies) dependencies.add(dependency)
  }

  return {
    files: [...files.entries()].map(([name, content]) => ({ name, content })),
    dependencies: [...dependencies].sort()
  }
}

export async function fetchUiComponentDocs(
  registryName: string,
  registryRoot: string = PACKAGE_ROOT
): Promise<string> {
  const itemName = registryItemName(registryName)
  const availableLocally = await localRegistryNames(registryRoot)
  if (availableLocally.has(itemName)) {
    const { loadRegistryItem } = await import('shadcn/registry')
    const item = await loadRegistryItem(itemName, { cwd: registryRoot })
    if (!item.docs) throw new Error(`Registry item "${registryName}" has no docs`)
    return item.docs
  }

  const { getRegistryItems } = await import('shadcn/registry')
  const items = await getRegistryItems([registryName], { config: ENGINE_CONFIG })
  const item = items?.find(candidate => candidate.name === itemName)
  if (!item?.docs) throw new Error(`Registry item "${registryName}" has no docs`)
  return item.docs
}

// ---------------------------------------------------------------------------
// Transforms
// ---------------------------------------------------------------------------

// Rewrite `@/registry/<style>/{lib,ui,hooks}/<x>` specifiers to sibling-relative
// paths. There is no engine knob for this: aliases are validated against
// tsconfig paths, so a relative alias value is rejected outright (verified —
// see docs/ui-components.md). Walks import AND export declarations on the same
// ts-morph SourceFile the icon transform used, so re-exports are covered.
function rewriteRegistryImports(sourceFile: SourceFile): void {
  const rewrite = (spec: string): string | null => {
    const match = /^@\/registry\/[^/]+\/(?:lib|ui|hooks)\/([\w-]+)$/.exec(spec)
    return match ? `./${match[1]}` : null
  }
  for (const decl of sourceFile.getImportDeclarations()) {
    const next = rewrite(decl.getModuleSpecifierValue())
    if (next) decl.setModuleSpecifier(next)
  }
  for (const decl of sourceFile.getExportDeclarations()) {
    const spec = decl.getModuleSpecifierValue()
    if (!spec) continue
    const next = rewrite(spec)
    if (next) decl.setModuleSpecifier(next)
  }
}

// The portal codemod. Base UI overlays portal into document.body — outside
// the applet container, so the applet's scoped styles ([data-applet="…"] …,
// see server/bundler/applet-css.ts) stop matching and overlays render on
// accidentally borrowed host styles. Overlays should keep portalling to body
// (escaping the widget frame's overflow/stacking is the point) — so instead
// of re-containering them, each `<X.Portal …>` without its own container is
// rewritten to `<AppletPortal portal={X.Portal} …>`, a wrapper (installed as
// `ui/applet-portal.tsx`) that re-establishes the scope attribute on the
// portalled subtree. A portal with an explicit `container` already owns its
// scope and stays untouched. Type positions (`X.Portal.Props`) are untouched —
// the rewrite only sees JSX tag names.
// `SyntaxKind` is passed in rather than imported: ts-morph is loaded lazily by
// the one caller below, so this helper cannot close over a module-level import.
function rewritePortals(
  sourceFile: SourceFile,
  SyntaxKind: typeof import('ts-morph').SyntaxKind
): boolean {
  const PORTAL_TAG = /^[A-Za-z_$][\w$]*\.Portal$/
  let touched = false

  for (const el of sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement)) {
    if (!PORTAL_TAG.test(el.getTagNameNode().getText())) continue
    if (el.getAttribute('container')) continue
    const portalExpr = el.getTagNameNode().getText()
    el.getTagNameNode().replaceWithText('AppletPortal')
    el.insertAttribute(0, { name: 'portal', initializer: `{${portalExpr}}` })
    touched = true
  }
  for (const el of sourceFile.getDescendantsOfKind(SyntaxKind.JsxElement)) {
    const opening = el.getOpeningElement()
    if (!PORTAL_TAG.test(opening.getTagNameNode().getText())) continue
    if (opening.getAttribute('container')) continue
    const portalExpr = opening.getTagNameNode().getText()
    opening.getTagNameNode().replaceWithText('AppletPortal')
    el.getClosingElement().getTagNameNode().replaceWithText('AppletPortal')
    opening.insertAttribute(0, { name: 'portal', initializer: `{${portalExpr}}` })
    touched = true
  }

  if (touched) {
    sourceFile.addImportDeclaration({
      moduleSpecifier: './applet-portal',
      namedImports: [{ name: 'AppletPortal' }]
    })
  }
  return touched
}

// One shared ts-morph project for all transforms in a process — creating a
// Project per file re-parses lib.d.ts and dominates runtime.
let project: Project | undefined

// Apply moi's transform pipeline to one raw registry file: shadcn's own icon
// transform (IconPlaceholder → @tabler/icons-react) and menu transform
// (cn-menu-* classes for the default menu color), then the relative-import
// rewrite and the portal codemod.
export async function transformUiComponentSource(name: string, raw: string): Promise<string> {
  const { Project, ScriptKind, SyntaxKind } = await import('ts-morph')
  const { transformIcons, transformMenu } = await import('shadcn/utils')

  project ??= new Project({ useInMemoryFileSystem: true })
  const sourceFile = project.createSourceFile(`moi-ui/${name}`, raw, {
    scriptKind: name.endsWith('.tsx') ? ScriptKind.TSX : ScriptKind.TS,
    overwrite: true
  })
  const opts = { sourceFile, filename: name, raw, config: ENGINE_CONFIG }
  await transformIcons(opts)
  await transformMenu(opts)
  rewriteRegistryImports(sourceFile)
  rewritePortals(sourceFile, SyntaxKind)
  return sourceFile.getFullText()
}

// ---------------------------------------------------------------------------
// The AppletPortal helper — installed once as `ui/applet-portal.tsx`
// ---------------------------------------------------------------------------

// Embedded as a scaffold template (see moi-scaffold.ts): the file belongs to
// the workspace, not to moi's bundle.
// The hidden marker renders where the overlay is used — inside the applet's
// DOM — and reads the nearest `data-applet` scope; the portalled children
// then render under an element carrying the same attribute, so the applet's
// scoped CSS matches again. `display: contents` keeps the wrapper out of
// layout; theme variables still resolve from the host `:root`.
//
// The file header below is written for its actual reader — the workspace
// agent browsing `.moi/ui/` — so it stays non-technical: what the file is
// for, that it's auto-generated, and that it must be left alone. The
// mechanism belongs here, not there.
export const APPLET_PORTAL_SOURCE = `"use client"

// Auto-generated by \`moi ui-components add\` — do not edit or remove.
//
// Keeps overlays (dialogs, menus, popovers, tooltips) styled correctly when
// they render outside the applet's own container. Components in this folder
// use it automatically; you never import it yourself.
import * as React from "react"

type AppletPortalProps = {
  portal: React.ElementType
  children?: React.ReactNode
} & Record<string, unknown>

function AppletPortal({ portal: Portal, children, ...props }: AppletPortalProps) {
  const [scope, setScope] = React.useState<string | undefined>(undefined)
  const marker = React.useCallback((node: HTMLElement | null) => {
    if (node) {
      setScope(node.closest("[data-applet]")?.getAttribute("data-applet") ?? undefined)
    }
  }, [])
  return (
    <>
      <span hidden ref={marker} />
      <Portal {...props}>
        <div data-applet={scope} style={{ display: "contents" }}>
          {children}
        </div>
      </Portal>
    </>
  )
}

export { AppletPortal }
`

// ---------------------------------------------------------------------------
// Name resolution + write planning (pure — covered by tests)
// ---------------------------------------------------------------------------

export type ResolvedRequest = {
  // Curated entries requested, validated.
  entries: string[]
  // Registry items to fetch (patterns expanded), deduplicated, in request order.
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
  // Written as-is, skipping the registry transform pipeline. Only the portal
  // helper uses this path; component files always come from a registry.
  verbatim: boolean
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
  files: FetchedUiFile[]
  requestedItems: string[]
  uiDir: string
  exists: (path: string) => boolean
}): PlannedWrite[] {
  const requested = new Set(opts.requestedItems.map(item => `${registryItemName(item)}.tsx`))
  const plans: PlannedWrite[] = [
    ...opts.files.map(file => ({
      name: file.name,
      content: file.content,
      support: !requested.has(file.name),
      verbatim: false
    })),
    { name: 'applet-portal.tsx', content: APPLET_PORTAL_SOURCE, support: true, verbatim: true }
  ].map(file => {
    const path = join(opts.uiDir, file.name)
    return { ...file, path, exists: opts.exists(path) }
  })
  return plans
}
