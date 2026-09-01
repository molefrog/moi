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
  // Source files moi authors itself (drawer) — written verbatim, next to any
  // fetched registryItems the component builds on. Already in final form:
  // relative imports, Tabler icons, no registry aliases — so the transform
  // pipeline is skipped for them.
  localFiles?: FetchedUiFile[]
  // Embedded docs markdown for moi-authored components, printed by
  // `moi ui-components docs <name>` instead of fetching an upstream page.
  localDocs?: string
}

// ---------------------------------------------------------------------------
// The drawer — moi-authored, not in the upstream registry
// ---------------------------------------------------------------------------

// A side panel scoped to the applet area. The upstream `sheet`/`drawer` items
// portal to document.body and position `fixed`, covering the whole app — wrong
// inside moi, where an applet owns only its own region. This derivative of the
// base-nova sheet portals into the applet's own mount container instead (the
// `[data-applet]` element every mount provides — AppletMount and ViewManager
// keep it `relative`/positioned and non-scrolling exactly so overlays can
// anchor to it) and positions `absolute`, so it docks to an edge of the applet
// and never leaves it. Because the portal target is inside `[data-applet]`,
// scoped applet CSS keeps matching — no AppletPortal re-scoping needed, and
// the `DrawerPrimitive.Portal` JSX must NOT be rewritten by the portal
// codemod, which is why local files skip transformUiComponentSource.
//
// Deliberate departures from the sheet:
//   • Always non-modal (`modal={false}` hard-wired): a modal Base UI dialog
//     locks page scroll and inerts everything outside the popup — the host
//     app included. Global takeover is exactly what this component exists to
//     avoid; blocking flows belong to `dialog`/`alert-dialog`.
//   • Outside clicks don't dismiss by default (`disablePointerDismissal`
//     defaults true, callers can flip it): the canonical use is master-detail
//     — click a row, inspect, click the next row — where dismiss-on-outside
//     would close and reopen the panel on every selection.
//   • No backdrop by default; `overlay` on DrawerContent opts in, and the
//     backdrop covers the applet area only.
// The popup sits in a `Dialog.Viewport` pinned over the applet
// (`absolute inset-0 overflow-hidden`) that clips the slide-in and, being
// `pointer-events-none`, lets the rest of the applet stay interactive.
export const DRAWER_SOURCE = `"use client"

// Installed by \`moi ui-components add drawer\` — a moi-authored component,
// yours to customize like every file in this folder.
//
// A panel that slides in from an edge of the APPLET AREA — the widget card or
// view region it renders in — never over the whole app. It stays non-modal:
// the rest of the applet keeps working while the drawer is open, and outside
// clicks don't close it (pass \`disablePointerDismissal={false}\` on the root
// for click-outside-to-close). Built for master-detail: keep it open and swap
// its content as the selection changes.
import * as React from "react"
import { Dialog as DrawerPrimitive } from "@base-ui/react/dialog"
import { IconX } from "@tabler/icons-react"

import { cn } from "./utils"
import { Button } from "./button"

function Drawer({
  disablePointerDismissal = true,
  ...props
}: Omit<DrawerPrimitive.Root.Props, "modal">) {
  return (
    <DrawerPrimitive.Root
      data-slot="drawer"
      modal={false}
      disablePointerDismissal={disablePointerDismissal}
      {...props}
    />
  )
}

function DrawerTrigger({ ...props }: DrawerPrimitive.Trigger.Props) {
  return <DrawerPrimitive.Trigger data-slot="drawer-trigger" {...props} />
}

function DrawerClose({ ...props }: DrawerPrimitive.Close.Props) {
  return <DrawerPrimitive.Close data-slot="drawer-close" {...props} />
}

function DrawerOverlay({ className, ...props }: DrawerPrimitive.Backdrop.Props) {
  return (
    <DrawerPrimitive.Backdrop
      data-slot="drawer-overlay"
      className={cn(
        "absolute inset-0 z-50 bg-black/10 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-xs",
        className
      )}
      {...props}
    />
  )
}

// Geometry per side as plain (unprefixed) classes, so callers can override
// them from \`className\` — \`cn\` merges \`w-80\` over \`w-3/4\`, which
// \`data-[side=…]:\`-prefixed classes would win against on specificity.
const drawerSideClasses = {
  top: "inset-x-0 top-0 max-h-3/4 border-b data-ending-style:translate-y-[-2.5rem] data-starting-style:translate-y-[-2.5rem]",
  right:
    "inset-y-0 right-0 w-3/4 max-w-sm border-l data-ending-style:translate-x-[2.5rem] data-starting-style:translate-x-[2.5rem]",
  bottom:
    "inset-x-0 bottom-0 max-h-3/4 border-t data-ending-style:translate-y-[2.5rem] data-starting-style:translate-y-[2.5rem]",
  left: "inset-y-0 left-0 w-3/4 max-w-sm border-r data-ending-style:translate-x-[-2.5rem] data-starting-style:translate-x-[-2.5rem]"
}

function DrawerContent({
  className,
  children,
  side = "right",
  overlay = false,
  showCloseButton = true,
  ...props
}: DrawerPrimitive.Popup.Props & {
  side?: keyof typeof drawerSideClasses
  // Dim the applet area behind the panel. The backdrop also swallows clicks on
  // the applet underneath, so combine with disablePointerDismissal={false}
  // when it should close on a click outside.
  overlay?: boolean
  showCloseButton?: boolean
}) {
  // The applet's mount container — the drawer portals into it and positions
  // against it, so it docks to the applet area, not the page. Outside a moi
  // mount (plain previews, tests) it falls back to the body.
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
        <DrawerPrimitive.Portal data-slot="drawer-portal" container={container}>
          {overlay && <DrawerOverlay />}
          <DrawerPrimitive.Viewport
            data-slot="drawer-viewport"
            className="pointer-events-none absolute inset-0 z-50 overflow-hidden"
          >
            <DrawerPrimitive.Popup
              data-slot="drawer-content"
              data-side={side}
              className={cn(
                "pointer-events-auto absolute flex flex-col gap-4 bg-popover bg-clip-padding text-sm text-popover-foreground shadow-lg transition duration-200 ease-in-out data-ending-style:opacity-0 data-starting-style:opacity-0",
                drawerSideClasses[side],
                className
              )}
              {...props}
            >
              {children}
              {showCloseButton && (
                <DrawerPrimitive.Close
                  data-slot="drawer-close"
                  render={
                    <Button
                      variant="ghost"
                      className="absolute top-3 right-3"
                      size="icon-sm"
                    />
                  }
                >
                  <IconX />
                  <span className="sr-only">Close</span>
                </DrawerPrimitive.Close>
              )}
            </DrawerPrimitive.Popup>
          </DrawerPrimitive.Viewport>
        </DrawerPrimitive.Portal>
      )}
    </>
  )
}

function DrawerHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-header"
      className={cn("flex flex-col gap-0.5 p-4", className)}
      {...props}
    />
  )
}

function DrawerFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  )
}

function DrawerTitle({ className, ...props }: DrawerPrimitive.Title.Props) {
  return (
    <DrawerPrimitive.Title
      data-slot="drawer-title"
      className={cn(
        "cn-font-heading text-base font-medium text-foreground",
        className
      )}
      {...props}
    />
  )
}

function DrawerDescription({
  className,
  ...props
}: DrawerPrimitive.Description.Props) {
  return (
    <DrawerPrimitive.Description
      data-slot="drawer-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Drawer,
  DrawerTrigger,
  DrawerClose,
  DrawerContent,
  DrawerOverlay,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
}
`

// Printed by `moi ui-components docs drawer` — the drawer has no upstream docs
// page, and its API deliberately differs from the sheet it derives from.
export const DRAWER_DOCS = `# Drawer

A panel that slides in from an edge of the **applet area** — the widget card or
view region it renders in. It never covers the whole app: the panel portals
into the applet's own mount container and positions against it. Non-modal by
design — the rest of the applet stays interactive while it is open.

Use it for contextual detail that accompanies the main content: a master-detail
inspector (click a table row, see its details docked to the right), filters, or
a settings pane. For a blocking flow that demands a response, use \`dialog\` or
\`alert-dialog\` instead.

## Usage

\`\`\`tsx
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '../ui/drawer'
\`\`\`

\`\`\`tsx
<Drawer>
  <DrawerTrigger render={<Button variant="outline" />}>Open</DrawerTrigger>
  <DrawerContent>
    <DrawerHeader>
      <DrawerTitle>Boldstart Ventures</DrawerTitle>
      <DrawerDescription>Fund · New York, NY</DrawerDescription>
    </DrawerHeader>
    <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">…</div>
  </DrawerContent>
</Drawer>
\`\`\`

## Master-detail (the canonical pattern)

Control the open state from the selection; keep the drawer open and swap its
content as the user clicks through items. Outside clicks do not close the
drawer (that is the default), so selecting another row simply updates the
panel:

\`\`\`tsx
const [selected, setSelected] = React.useState<Item | null>(null)

<Drawer open={selected !== null} onOpenChange={open => !open && setSelected(null)}>
  <DrawerContent aria-label="Item details">
    {selected && (
      <>
        <DrawerHeader>
          <DrawerTitle>{selected.name}</DrawerTitle>
        </DrawerHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">…</div>
      </>
    )}
  </DrawerContent>
</Drawer>
\`\`\`

## API notes

- **\`side\`** on DrawerContent: \`right\` (default), \`left\`, \`top\`, \`bottom\`.
- **Width/height**: defaults to 3/4 of the applet area capped at \`max-w-sm\`;
  override with layout classes — \`<DrawerContent className="w-80 max-w-full">\`.
- **\`overlay\`** on DrawerContent dims the applet area behind the panel (off by
  default). The backdrop also swallows clicks on the applet underneath.
- **\`disablePointerDismissal\`** on Drawer defaults to \`true\` (outside clicks
  don't close). Pass \`false\` for click-outside-to-close — pair it with
  \`overlay\` so the dismissal area is visible.
- **\`showCloseButton\`** on DrawerContent (default \`true\`) renders the ✕ in the
  top-right corner.
- **Always give the drawer a title**: a \`DrawerTitle\` (use
  \`className="sr-only"\` to hide it) or an \`aria-label\` on DrawerContent.
- **Scrolling content** goes in a \`min-h-0 flex-1 overflow-y-auto\` region
  between header and footer (the popup is a flex column).
- There is no \`modal\` prop: the drawer is always non-modal. Focus still moves
  into the panel on open; pass \`initialFocus={false}\` on DrawerContent to
  leave focus where it is (e.g. keyboard navigation over a table).
- The drawer needs a moi applet mount (\`[data-applet]\`) to dock to; anywhere
  else it falls back to the page body.
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
    description: 'Panel sliding in from an edge of the applet area — non-modal, applet-scoped',
    // The close button composes `button`; the drawer source itself is
    // moi-authored (see DRAWER_SOURCE above) and rides along verbatim.
    registryItems: ['button'],
    localFiles: [{ name: 'drawer.tsx', content: DRAWER_SOURCE }],
    localDocs: DRAWER_DOCS
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
  // moi-authored sources the requested entries carry, deduplicated by file.
  localFiles: FetchedUiFile[]
  // Union of extraDeps across the requested entries.
  extraDeps: string[]
  unknown: string[]
}

export function resolveUiComponentRequest(names: string[]): ResolvedRequest {
  const entries: string[] = []
  const registryItems: string[] = []
  const localFiles = new Map<string, FetchedUiFile>()
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
    for (const file of entry.localFiles ?? []) localFiles.set(file.name, file)
    for (const dep of entry.extraDeps ?? []) extraDeps.add(dep)
  }

  return {
    entries,
    registryItems,
    localFiles: [...localFiles.values()],
    extraDeps: [...extraDeps].sort(),
    unknown
  }
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
  // Already in final form (moi-authored sources: drawer, applet-portal) — the
  // registry transform pipeline must not touch these. In particular the portal
  // codemod would rewrite the drawer's `DrawerPrimitive.Portal` (its container
  // targeting is the whole point) into an AppletPortal.
  pretransformed: boolean
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
  // moi-authored sources riding along with the request — always requested
  // files (the entry that carries them was asked for by name), never fetched,
  // never transformed.
  localFiles?: FetchedUiFile[]
  requestedItems: string[]
  uiDir: string
  exists: (path: string) => boolean
}): PlannedWrite[] {
  const requested = new Set(opts.requestedItems.map(item => `${item}.tsx`))
  const plans: PlannedWrite[] = [
    ...opts.files.map(file => ({
      name: file.name,
      content: file.content,
      support: !requested.has(file.name),
      pretransformed: false
    })),
    ...(opts.localFiles ?? []).map(file => ({
      name: file.name,
      content: file.content,
      support: false,
      pretransformed: true
    })),
    {
      name: 'applet-portal.tsx',
      content: APPLET_PORTAL_SOURCE,
      support: true,
      pretransformed: true
    }
  ].map(file => {
    const path = join(opts.uiDir, file.name)
    return { ...file, path, exists: opts.exists(path) }
  })
  return plans
}
