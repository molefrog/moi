// The `moi ui-components` engine: a shadcn-lite proxy over the `shadcn`
// package's own programmatic registry + transform APIs (see docs/moi-shadcn.md
// for the full spec and the research trail in PR #78).
//
// Opinions, enforced here: the upstream registry is the source of truth
// (style `base-nova`, Base UI primitives, Tabler icons); the command exposes
// only a curated subset of it; no config files ever land in the workspace —
// the engine takes its config as the in-memory object below; components are
// written to `.moi/ui/` and imported relatively (`../ui/button`). The command
// writes source files and nothing else: it never installs dependencies and
// never rebuilds — it prints next steps for the agent instead.
// `shadcn/registry`, `shadcn/utils` and `ts-morph` are imported at their call
// sites rather than here, deliberately. Together they are ~31 MB of JS across
// 1600 modules (ts-morph alone embeds the whole TypeScript compiler), and the
// cost is parse + top-level evaluation, so bundling does not help — measured
// at ~300 ms. Only `moi ui-components add` ever fetches or transforms; a
// static import here made every `moi` command pay it, `moi version` included.
import type { Project, SourceFile } from 'ts-morph'
import { join } from 'path'

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
  // Extra markdown printed after the fetched upstream docs — how moi's
  // install-time source patch (see UI_SOURCE_PATCHES) changes the component.
  docsAppendix?: string
}

// ---------------------------------------------------------------------------
// Source patches — the applet-scoping patch for the upstream drawer
// ---------------------------------------------------------------------------

export type UiSourcePatch = {
  // Verbatim anchor in the pristine upstream source. Every anchor must match,
  // or the patch refuses to apply — half-patched output is worse than a loud
  // failure when upstream drifts.
  find: string
  replace: string
}

// The upstream `drawer` (Base UI Drawer primitive: swipe to dismiss, snap
// points, nested stacking) portals to document.body and positions `fixed`,
// covering the whole page — wrong inside moi, where an applet owns only its
// own region. Rather than forking it, `add` fetches the registry item like any
// other component and applies this patch, keeping everything else — gestures,
// snap points, stacking, transitions — upstream's:
//
//   • The portal targets the applet's own mount container (the `[data-applet]`
//     element — AppletMount and ViewManager keep it positioned and
//     non-scrolling exactly so overlays can anchor to it). Because the portal
//     stays inside `[data-applet]`, scoped applet CSS keeps matching with no
//     AppletPortal re-scoping; the aliased `DrawerPortalPrimitive` in the
//     replacement is deliberate — it keeps the portal codemod (rewritePortals
//     below) from wrapping this portal, which must keep its `container`.
//   • `fixed` → `absolute` on backdrop, viewport, and popup, and viewport
//     units (`dvh`) → container percentages, so the drawer docks to an edge of
//     the applet area. Snap points already measure the Viewport element
//     (never the window), so they turn applet-relative on their own. The
//     viewport also gains `overflow-hidden`: it clips the popup's off-screen
//     closed position at the applet edge, where the page edge used to clip it.
//   • Defaults flip to non-modal + no pointer dismissal (both stay props): a
//     modal drawer locks page scroll and inerts everything outside the popup,
//     the host app included, and the canonical applet use is master-detail —
//     click a row, inspect, click the next row — where an outside-press
//     dismissal would close and reopen the panel on every selection. Blocking
//     flows belong to `dialog`/`alert-dialog`.
export const UI_SOURCE_PATCHES: Record<string, UiSourcePatch[]> = {
  'drawer.tsx': [
    {
      // Non-modal, non-dismissing defaults; the new prop is forwarded below.
      find: `function Drawer({
  modal = true,
  showSwipeHandle = false,`,
      replace: `function Drawer({
  // moi: non-modal by default — a modal drawer locks page scroll and disables
  // the whole app outside the popup. Outside clicks don't dismiss by default
  // either, so master-detail selection clicks never close the panel. Both
  // stay props.
  modal = false,
  disablePointerDismissal = true,
  showSwipeHandle = false,`
    },
    {
      find: `        modal={modal}
        snapPoints={snapPoints}`,
      replace: `        modal={modal}
        disablePointerDismissal={disablePointerDismissal}
        snapPoints={snapPoints}`
    },
    {
      // Portal into the applet's mount container instead of document.body.
      find: `function DrawerPortal({ ...props }: DrawerPrimitive.Portal.Props) {
  return <DrawerPrimitive.Portal data-slot="drawer-portal" {...props} />
}`,
      replace: `const DrawerPortalPrimitive = DrawerPrimitive.Portal

function DrawerPortal({ ...props }: DrawerPrimitive.Portal.Props) {
  // moi: portal into the applet's own mount container ([data-applet]) so the
  // drawer docks to the applet area, not the page. Falls back to the body
  // outside a moi mount (plain previews, tests).
  const [container, setContainer] = React.useState<HTMLElement | null>(null)
  const marker = React.useCallback((node: HTMLSpanElement | null) => {
    if (node) {
      setContainer((node.closest("[data-applet]") as HTMLElement | null) ?? document.body)
    }
  }, [])
  return (
    <>
      <span hidden ref={marker} />
      {container && (
        <DrawerPortalPrimitive data-slot="drawer-portal" container={container} {...props} />
      )}
    </>
  )
}`
    },
    {
      // Backdrop: absolute within the applet. The dvh floor and the iOS
      // absolute fallback (below) are page-viewport workarounds with no
      // container equivalent.
      find: `"fixed inset-0 z-50 min-h-dvh bg-black/10`,
      replace: `"absolute inset-0 z-50 bg-black/10`
    },
    {
      find: ` supports-[-webkit-touch-callout:none]:absolute",`,
      replace: `",`
    },
    {
      // Viewport: pinned over the applet area; overflow-hidden clips the
      // popup's off-screen closed position at the applet edge.
      find: `className="pointer-events-none fixed inset-0 z-50 select-none data-[modal=true]:pointer-events-auto"`,
      replace: `className="pointer-events-none absolute inset-0 z-50 overflow-hidden select-none data-[modal=true]:pointer-events-auto"`
    },
    {
      find: `pointer-events-auto fixed z-50 m-(--drawer-inset,0px)`,
      replace: `pointer-events-auto absolute z-50 m-(--drawer-inset,0px)`
    },
    {
      // Container-relative sizing: the viewport fills the applet area, so %
      // replaces dvh (Tailwind normalizes the calc operator spacing).
      find: `data-[swipe-axis=y]:[--drawer-content-max-height:calc(100dvh-6rem)]`,
      replace: `data-[swipe-axis=y]:[--drawer-content-max-height:calc(100%-6rem)]`
    },
    {
      find: `data-[swipe-axis=y]:data-snap-points:[--drawer-content-height:100dvh]`,
      replace: `data-[swipe-axis=y]:data-snap-points:[--drawer-content-height:100%]`
    }
  ]
}

// Apply a file's source patch, refusing half-application: a missing anchor
// means the upstream source drifted and the patch needs updating — fail the
// add loudly rather than install a broken component.
export function applyUiSourcePatches(name: string, source: string): string {
  const patches = UI_SOURCE_PATCHES[name]
  if (!patches) return source
  let patched = source
  for (const patch of patches) {
    if (!patched.includes(patch.find)) {
      throw new Error(
        `The registry source for ${name} no longer matches moi's applet-scoping patch ` +
          `(missing anchor: ${JSON.stringify(patch.find.slice(0, 60))}…). ` +
          'Upstream drifted — update UI_SOURCE_PATCHES in server/ui-components.ts.'
      )
    }
    patched = patched.replace(patch.find, patch.replace)
  }
  return patched
}

// Printed by `moi ui-components docs drawer` after the upstream page — the
// deltas the install-time patch introduces, plus applet-specific usage.
export const DRAWER_DOCS_APPENDIX = `---

## moi notes (applet-scoped drawer)

moi patches the drawer at install so it docks to an edge of the **applet
area** — the widget card or view region it renders in — instead of covering
the page: it portals into the applet's own mount container and positions
against it. Swipe to dismiss, snap points, and stacking all still work and
are measured against the applet area, not the browser viewport.

Deltas from the upstream docs:

- **Non-modal by default** (\`modal\` defaults to \`false\`): no backdrop, and
  the rest of the applet stays interactive. \`modal={true}\` still renders the
  backdrop over the applet area but locks scroll and interaction for the whole
  page, not just the applet — prefer \`dialog\`/\`alert-dialog\` for blocking
  flows.
- **Outside clicks don't dismiss by default** (\`disablePointerDismissal\`
  defaults to \`true\`): built for master-detail, where clicking the next row
  must not close the panel. Pass \`disablePointerDismissal={false}\` for
  click-outside-to-close. Escape and swiping still close it.
- **Docking side** comes from \`swipeDirection\` on the root: \`"right"\` docks
  the panel to the right edge (swipe right to dismiss) — the inspector
  pattern; \`"down"\` (the default) is a bottom sheet.
- **Width/height**: x-axis drawers default to 75% of the applet width, capped
  at 24rem; override with a width utility — \`<DrawerContent className="w-80">\`
  (cn() merges it over the built-in variable width). y-axis height follows
  content; fix it with the \`--drawer-height\` variable
  (\`className="[--drawer-height:50%]"\`) or snap points — both applet-relative.
- **No built-in close button**: compose one —
  \`<DrawerClose render={<Button variant="ghost" size="icon-sm" />}><IconX /></DrawerClose>\`.
- Always give the drawer a \`DrawerTitle\` (\`className="sr-only"\` to hide it)
  or an \`aria-label\` on DrawerContent.
- Needs \`@base-ui/react\` **1.3.0+** (where the Drawer primitive left
  preview). A workspace scaffolded earlier may have an older lockfile pin —
  if the build fails on a missing \`Drawer\` export, run
  \`bun update @base-ui/react\` in \`.moi/\`.

Master-detail (the canonical applet pattern):

\`\`\`tsx
const [selected, setSelected] = React.useState<Item | null>(null)

<Drawer
  swipeDirection="right"
  open={selected !== null}
  onOpenChange={open => !open && setSelected(null)}
>
  <DrawerContent aria-label="Item details">
    {selected && (
      <>
        <DrawerHeader>
          <DrawerTitle>{selected.name}</DrawerTitle>
        </DrawerHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">…</div>
      </>
    )}
  </DrawerContent>
</Drawer>
\`\`\`
`

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
    description:
      'Swipeable panel docking to an edge of the applet area — the upstream drawer, applet-scoped at install',
    // The upstream item, with moi's applet-scoping patch applied by the
    // transform pipeline (see UI_SOURCE_PATCHES above).
    registryItems: ['drawer'],
    docsAppendix: DRAWER_DOCS_APPENDIX
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

// Where a registry file lands in `.moi/ui/`. Registry paths look like
// `registry/base-nova/ui/button.tsx`, `registry/base-nova/lib/utils.ts`,
// `registry/base-nova/hooks/use-mobile.ts` — everything flattens into the one
// ui dir so relative imports stay `./<name>`.
function uiFileName(registryPath: string): string {
  const base = registryPath.split('/').pop() ?? registryPath
  return base
}

// Fetch the requested registry items plus their registryDependencies, closed
// transitively, deduplicated. `utils` (the `cn` helper) rides along on every
// fetch — it is the one support file everything imports.
export async function fetchUiComponents(registryNames: string[]): Promise<FetchedUiComponents> {
  const files = new Map<string, string>()
  const dependencies = new Set<string>()
  const fetched = new Set<string>()
  let queue = [...new Set(['utils', ...registryNames])]

  const { getRegistryItems } = await import('shadcn/registry')

  while (queue.length > 0) {
    const batch = queue.filter(name => !fetched.has(name))
    if (batch.length === 0) break
    for (const name of batch) fetched.add(name)

    const items = await getRegistryItems(batch, { config: ENGINE_CONFIG })
    const next: string[] = []
    for (const item of items ?? []) {
      for (const dep of item.dependencies ?? []) dependencies.add(dep)
      for (const dep of item.registryDependencies ?? []) {
        // Registry deps are plain item names for the shadcn registry; URLs
        // would point at third-party registries, which the curated set never
        // references.
        if (!fetched.has(dep)) next.push(dep)
      }
      for (const file of item.files ?? []) {
        if (!file.content) continue
        files.set(uiFileName(file.path), file.content)
      }
    }
    queue = next
  }

  return {
    files: [...files.entries()].map(([name, content]) => ({ name, content })),
    dependencies: [...dependencies].sort()
  }
}

// ---------------------------------------------------------------------------
// Transforms
// ---------------------------------------------------------------------------

// Rewrite `@/registry/<style>/{lib,ui,hooks}/<x>` specifiers to sibling-relative
// paths. There is no engine knob for this: aliases are validated against
// tsconfig paths, so a relative alias value is rejected outright (verified —
// see docs/moi-shadcn.md). Walks import AND export declarations on the same
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
// of re-containering them, every `<X.Portal …>` JSX element is rewritten to
// `<AppletPortal portal={X.Portal} …>`, a wrapper (installed as
// `ui/applet-portal.tsx`) that re-establishes the scope attribute on the
// portalled subtree. Type positions (`X.Portal.Props`) are untouched — the
// rewrite only sees JSX tag names.
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
    const portalExpr = el.getTagNameNode().getText()
    el.getTagNameNode().replaceWithText('AppletPortal')
    el.insertAttribute(0, { name: 'portal', initializer: `{${portalExpr}}` })
    touched = true
  }
  for (const el of sourceFile.getDescendantsOfKind(SyntaxKind.JsxElement)) {
    const opening = el.getOpeningElement()
    if (!PORTAL_TAG.test(opening.getTagNameNode().getText())) continue
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

  // moi's source patches (drawer) run first, on the pristine upstream text —
  // their anchors are verbatim registry source, and the patched output is
  // shaped to survive the codemods below (see UI_SOURCE_PATCHES).
  const source = applyUiSourcePatches(name, raw)

  project ??= new Project({ useInMemoryFileSystem: true })
  const sourceFile = project.createSourceFile(`moi-ui/${name}`, source, {
    scriptKind: name.endsWith('.tsx') ? ScriptKind.TSX : ScriptKind.TS,
    overwrite: true
  })
  const opts = { sourceFile, filename: name, raw: source, config: ENGINE_CONFIG }
  await transformIcons(opts)
  await transformMenu(opts)
  rewriteRegistryImports(sourceFile)
  rewritePortals(sourceFile, SyntaxKind)
  return sourceFile.getFullText()
}

// ---------------------------------------------------------------------------
// The AppletPortal helper — installed once as `ui/applet-portal.tsx`
// ---------------------------------------------------------------------------

// Embedded as a string like the other scaffold templates (see
// moi-scaffold.ts): the file belongs to the workspace, not to moi's bundle.
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
    if (!entries.includes(name)) entries.push(name)
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
  files: FetchedUiFile[]
  requestedItems: string[]
  uiDir: string
  exists: (path: string) => boolean
}): PlannedWrite[] {
  const requested = new Set(opts.requestedItems.map(item => `${item}.tsx`))
  const plans: PlannedWrite[] = [
    ...opts.files.map(file => ({
      name: file.name,
      content: file.content,
      support: !requested.has(file.name)
    })),
    { name: 'applet-portal.tsx', content: APPLET_PORTAL_SOURCE, support: true }
  ].map(file => {
    const path = join(opts.uiDir, file.name)
    return { ...file, path, exists: opts.exists(path) }
  })
  return plans
}
