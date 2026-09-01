import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'path'

import { buildApplet } from '../bundler/build-applet'
import {
  APPLET_PORTAL_SOURCE,
  UI_COMPONENTS,
  UI_COMPONENT_NAMES,
  partitionUiWrites,
  planUiWrites,
  resolveUiComponentRequest,
  suggestUiComponents,
  transformUiComponentSource,
  uiComponentFiles
} from '../ui-components'
import { DRAWER_DOCS, DRAWER_SOURCE } from '../ui-components-drawer'

// Raw registry content, shrunk from real base-nova items: the icon
// placeholder shape, alias imports, and the two portal shapes (pass-through
// wrapper with spread props, inline Portal > Positioner > Popup). Everything
// the transform pipeline must handle, no network involved.
const RAW_POPOVER = `"use client"

import * as React from "react"
import { Popover as PopoverPrimitive } from "@base-ui/react/popover"

import { cn } from "@/registry/base-nova/lib/utils"

function PopoverContent({ className, ...props }: PopoverPrimitive.Popup.Props) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner className="isolate z-50">
        <PopoverPrimitive.Popup className={cn("bg-popover", className)} {...props} />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  )
}

export { PopoverContent }
`

const RAW_DIALOG = `"use client"

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"

import { Button } from "@/registry/base-nova/ui/button"

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

export { DialogPortal }
`

const RAW_WITH_ICON = `import { IconPlaceholder } from "@/app/(create)/components/icon-placeholder"

function Chevron() {
  return (
    <IconPlaceholder
      lucide="ChevronDownIcon"
      tabler="IconChevronDown"
      data-icon="inline-end"
    />
  )
}

export { Chevron }
`

describe('transformUiComponentSource', () => {
  test('rewrites alias imports to sibling-relative paths', async () => {
    const popover = await transformUiComponentSource('popover.tsx', RAW_POPOVER)
    expect(popover).toContain(`from "./utils"`)
    expect(popover).not.toContain('@/registry')

    const dialog = await transformUiComponentSource('dialog.tsx', RAW_DIALOG)
    expect(dialog).toContain(`from "./button"`)
    expect(dialog).not.toContain('@/registry')
  })

  test('wraps inline portal JSX in AppletPortal and adds the import', async () => {
    const out = await transformUiComponentSource('popover.tsx', RAW_POPOVER)

    expect(out).toContain('<AppletPortal portal={PopoverPrimitive.Portal}>')
    expect(out).toContain('</AppletPortal>')
    expect(out).toContain(`import { AppletPortal } from "./applet-portal"`)
    // Children stay inside the wrapper untouched.
    expect(out).toContain('<PopoverPrimitive.Positioner className="isolate z-50">')
  })

  test('wraps self-closing pass-through portals, keeping their props', async () => {
    const out = await transformUiComponentSource('dialog.tsx', RAW_DIALOG)

    expect(out).toContain(
      '<AppletPortal portal={DialogPrimitive.Portal} data-slot="dialog-portal" {...props} />'
    )
  })

  test('leaves Portal type references untouched', async () => {
    const out = await transformUiComponentSource('dialog.tsx', RAW_DIALOG)

    // The props type still points at the primitive, not the wrapper.
    expect(out).toContain('DialogPrimitive.Portal.Props')
  })

  test('replaces IconPlaceholder with the tabler icon and import', async () => {
    const out = await transformUiComponentSource('chevron.tsx', RAW_WITH_ICON)

    expect(out).toContain(`import { IconChevronDown } from "@tabler/icons-react"`)
    expect(out).toContain('<IconChevronDown data-icon="inline-end" />')
    expect(out).not.toContain('IconPlaceholder')
    expect(out).not.toContain('lucide')
  })

  test('does not touch files without portals or icons', async () => {
    const raw = `import { cn } from "@/registry/base-nova/lib/utils"\n\nexport const x = () => cn("a")\n`
    const out = await transformUiComponentSource('x.tsx', raw)

    expect(out).not.toContain('applet-portal')
    expect(out).toContain(`from "./utils"`)
  })
})

describe('resolveUiComponentRequest', () => {
  test('maps curated names to registry items, deduplicated', () => {
    const request = resolveUiComponentRequest(['button', 'popover', 'button'])

    expect(request.entries).toEqual(['button', 'popover'])
    expect(request.registryItems).toEqual(['button', 'popover'])
    expect(request.unknown).toEqual([])
  })

  test('expands pattern entries to their building blocks', () => {
    const request = resolveUiComponentRequest(['date-picker'])
    expect(request.registryItems).toEqual(['calendar', 'popover', 'button'])

    const table = resolveUiComponentRequest(['data-table'])
    expect(table.registryItems).toEqual(['table'])
    expect(table.extraDeps).toEqual(['@tanstack/react-table'])
  })

  test('collects unknown names instead of throwing', () => {
    const request = resolveUiComponentRequest(['button', 'sidebar'])

    expect(request.entries).toEqual(['button'])
    expect(request.unknown).toEqual(['sidebar'])
  })

  test('suggests close catalog names for typos', () => {
    expect(suggestUiComponents('alertdialog')[0]).toBe('alert-dialog')
    expect(suggestUiComponents('tooltp')[0]).toBe('tooltip')
    expect(suggestUiComponents('combo')).toContain('combobox')
  })
})

describe('planUiWrites', () => {
  const uiDir = '/ws/.moi/ui'
  const files = [
    { name: 'field.tsx', content: 'field' },
    { name: 'label.tsx', content: 'label' },
    { name: 'utils.ts', content: 'utils' }
  ]

  test('marks requested vs support files and existing targets', () => {
    const plans = planUiWrites({
      files,
      requestedItems: ['field'],
      uiDir,
      exists: path => path.endsWith('label.tsx')
    })

    const byName = new Map(plans.map(plan => [plan.name, plan]))
    expect(byName.get('field.tsx')).toMatchObject({ support: false, exists: false })
    expect(byName.get('label.tsx')).toMatchObject({ support: true, exists: true })
    expect(byName.get('utils.ts')).toMatchObject({ support: true, exists: false })
    // The portal helper always rides along.
    expect(byName.get('applet-portal.tsx')).toMatchObject({
      support: true,
      path: join(uiDir, 'applet-portal.tsx')
    })
    expect(byName.get('applet-portal.tsx')?.content).toBe(APPLET_PORTAL_SOURCE)
  })
})

describe('partitionUiWrites', () => {
  const plan = (name: string, opts: { exists?: boolean; support?: boolean } = {}) => ({
    name,
    path: `/ws/.moi/ui/${name}`,
    content: name,
    exists: opts.exists ?? false,
    support: opts.support ?? false,
    verbatim: false
  })

  test('a bulk add skips installed components and writes the rest', () => {
    const partition = partitionUiWrites(
      [
        plan('button.tsx', { exists: true }),
        plan('badge.tsx'),
        plan('utils.ts', { support: true, exists: true }),
        plan('applet-portal.tsx', { support: true })
      ],
      false
    )

    expect(partition.write.map(p => p.name)).toEqual(['badge.tsx', 'applet-portal.tsx'])
    expect(partition.skipInstalled.map(p => p.name)).toEqual(['button.tsx'])
    expect(partition.keepSupport.map(p => p.name)).toEqual(['utils.ts'])
    expect(partition.allInstalled).toBe(false)
  })

  test('flags the no-op add when every requested component exists', () => {
    const partition = partitionUiWrites(
      [
        plan('button.tsx', { exists: true }),
        plan('badge.tsx', { exists: true }),
        plan('utils.ts', { support: true, exists: true })
      ],
      false
    )

    expect(partition.allInstalled).toBe(true)
    expect(partition.skipInstalled.map(p => p.name)).toEqual(['button.tsx', 'badge.tsx'])
    expect(partition.write).toEqual([])
  })

  test('--force overwrites requested files but never existing support files', () => {
    const partition = partitionUiWrites(
      [
        plan('button.tsx', { exists: true }),
        plan('badge.tsx'),
        plan('utils.ts', { support: true, exists: true })
      ],
      true
    )

    expect(partition.write.map(p => p.name)).toEqual(['button.tsx', 'badge.tsx'])
    expect(partition.skipInstalled).toEqual([])
    expect(partition.keepSupport.map(p => p.name)).toEqual(['utils.ts'])
    expect(partition.allInstalled).toBe(false)
  })
})

describe('catalog', () => {
  test('every entry has a description and either registry items or its own source', () => {
    for (const name of UI_COMPONENT_NAMES) {
      const entry = UI_COMPONENTS[name]
      expect(entry.description.length).toBeGreaterThan(0)
      expect(entry.registryItems.length > 0 || Boolean(entry.source)).toBe(true)
      // Inline docs exist exactly for the entries with no upstream page.
      expect(Boolean(entry.docs)).toBe(Boolean(entry.source))
      // Catalog keys are kebab-case slugs — they double as docs slugs.
      expect(name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    }
  })

  test('exposes exactly the agreed subset', () => {
    // The final component list from the review (Aug 2026).
    expect(UI_COMPONENT_NAMES).toEqual([
      'accordion',
      'alert',
      'alert-dialog',
      'attachment',
      'avatar',
      'badge',
      'bubble',
      'button',
      'button-group',
      'calendar',
      'carousel',
      'chart',
      'checkbox',
      'collapsible',
      'combobox',
      'context-menu',
      'data-table',
      'date-picker',
      'dialog',
      'drawer',
      'dropdown-menu',
      'field',
      'hover-card',
      'input',
      'input-group',
      'label',
      'pagination',
      'popover',
      'progress',
      'radio-group',
      'resizable',
      'select',
      'separator',
      'skeleton',
      'slider',
      'spinner',
      'switch',
      'table',
      'tabs',
      'textarea',
      'toggle-group',
      'tooltip'
    ])
  })
})

describe('moi-authored entries', () => {
  test('drawer resolves to its embedded source and no registry items', () => {
    const request = resolveUiComponentRequest(['drawer'])

    expect(request.entries).toEqual(['drawer'])
    expect(request.registryItems).toEqual([])
    expect(request.localFiles).toEqual([
      { name: 'drawer.tsx', content: DRAWER_SOURCE, verbatim: true }
    ])
    expect(request.unknown).toEqual([])
  })

  test('mixes with registry entries in one request', () => {
    const request = resolveUiComponentRequest(['drawer', 'button', 'drawer'])

    expect(request.entries).toEqual(['drawer', 'button'])
    expect(request.registryItems).toEqual(['button'])
    expect(request.localFiles.map(file => file.name)).toEqual(['drawer.tsx'])
  })

  test('counts as installed by its own file', () => {
    expect(uiComponentFiles('drawer')).toEqual(['drawer.tsx'])
    expect(uiComponentFiles('button')).toEqual(['button.tsx'])
    expect(uiComponentFiles('date-picker')).toEqual(['calendar.tsx', 'popover.tsx', 'button.tsx'])
  })

  test('is planned as a requested, verbatim write', () => {
    const plans = planUiWrites({
      files: [
        { name: 'utils.ts', content: 'utils' },
        ...resolveUiComponentRequest(['drawer']).localFiles
      ],
      requestedItems: ['drawer'],
      uiDir: '/ws/.moi/ui',
      exists: () => false
    })

    const byName = new Map(plans.map(plan => [plan.name, plan]))
    expect(byName.get('drawer.tsx')).toMatchObject({ support: false, verbatim: true })
    // Registry content still goes through the transform pipeline.
    expect(byName.get('utils.ts')).toMatchObject({ support: true, verbatim: false })
    // The portal helper is moi-authored too — nothing in it to transform.
    expect(byName.get('applet-portal.tsx')).toMatchObject({ support: true, verbatim: true })
  })
})

describe('drawer source', () => {
  test('is already in workspace form', () => {
    // What the transform pipeline would otherwise have to produce: relative
    // imports, Tabler icons, no registry aliases, no placeholder icons.
    expect(DRAWER_SOURCE).toContain('from "./utils"')
    expect(DRAWER_SOURCE).toContain('from "@tabler/icons-react"')
    expect(DRAWER_SOURCE).toContain('from "@base-ui/react/dialog"')
    expect(DRAWER_SOURCE).not.toContain('@/')
    expect(DRAWER_SOURCE).not.toContain('IconPlaceholder')
    expect(DRAWER_SOURCE).not.toContain('lucide')
  })

  test('scopes itself to the applet root, never the page', () => {
    // Portals into the nearest [data-applet] element and positions against
    // it: no body portal, no fixed positioning, and no page-modal state
    // (trap-focus keeps the rest of the workspace scrollable and clickable).
    expect(DRAWER_SOURCE).toContain('closest<HTMLElement>("[data-applet]")')
    expect(DRAWER_SOURCE).toContain('<DrawerPrimitive.Portal container={container}>')
    expect(DRAWER_SOURCE).toContain('modal = "trap-focus"')
    expect(DRAWER_SOURCE).not.toContain('document.body')
    expect(DRAWER_SOURCE).not.toMatch(/\bfixed\b/)
    // Not wrapped by the body-portal helper either — that would defeat it.
    expect(DRAWER_SOURCE).not.toContain('AppletPortal')
  })

  test('exports the sheet-shaped parts and documents each', () => {
    for (const part of [
      'Drawer',
      'DrawerTrigger',
      'DrawerContent',
      'DrawerHeader',
      'DrawerBody',
      'DrawerFooter',
      'DrawerTitle',
      'DrawerDescription',
      'DrawerClose'
    ]) {
      expect(DRAWER_SOURCE).toContain(`function ${part}(`)
      expect(DRAWER_SOURCE).toMatch(new RegExp(`^  ${part},?$`, 'm'))
      expect(DRAWER_DOCS).toContain(part)
    }
  })
})

describe('drawer build', () => {
  // The source compiles the way an installed `.moi/ui/drawer.tsx` would: Base
  // UI and Tabler resolve, and the synthetic Tailwind entry emits the
  // animation vocabulary the panel relies on. Laid out like a workspace —
  // `ui/` beside `widgets/` — inside the repo tree so `@import 'tailwindcss'`
  // and the component deps resolve against the repo's node_modules.
  let root: string

  const injectedCss = (js: string): string => {
    const match = js.match(/^\(css => \{[\s\S]*?\}\)\((".*")\);/m)
    return match ? (JSON.parse(match[1]) as string) : ''
  }

  beforeAll(async () => {
    root = mkdtempSync(join(import.meta.dir, 'drawer-ws-'))
    mkdirSync(join(root, 'ui'))
    mkdirSync(join(root, 'widgets'))
    writeFileSync(
      join(root, 'ui', 'utils.ts'),
      [
        'import { clsx, type ClassValue } from "clsx"',
        'import { twMerge } from "tailwind-merge"',
        'export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)) }'
      ].join('\n')
    )
    writeFileSync(join(root, 'ui', 'drawer.tsx'), DRAWER_SOURCE)
    writeFileSync(
      join(root, 'widgets', 'consumer.tsx'),
      [
        "import { Drawer, DrawerBody, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle, DrawerTrigger } from '../ui/drawer'",
        'export default function Consumer() {',
        '  return (',
        '    <Drawer>',
        '      <DrawerTrigger>Open</DrawerTrigger>',
        '      <DrawerContent side="right">',
        '        <DrawerHeader><DrawerTitle>Title</DrawerTitle><DrawerDescription>Desc</DrawerDescription></DrawerHeader>',
        '        <DrawerBody>body</DrawerBody>',
        '        <DrawerFooter><DrawerClose>Done</DrawerClose></DrawerFooter>',
        '      </DrawerContent>',
        '    </Drawer>',
        '  )',
        '}'
      ].join('\n')
    )
    // Same first-build quirk as build-applet.test.ts: under `bun test` the very
    // first Bun.build with this option combo fails to resolve the entry.
    await buildApplet(join(root, 'widgets', 'consumer.tsx'), root).catch(() => {})
  })

  afterAll(() => {
    rmSync(root, { recursive: true, force: true })
  })

  test('compiles with its styling vocabulary, scoped', async () => {
    const result = await buildApplet(join(root, 'widgets', 'consumer.tsx'), root)
    const css = injectedCss(result.js)

    expect(result.js).toContain('drawer-content')
    // The animation utilities only ever appear behind the open/closed state
    // variants, so Tailwind emits them as `.data-open\:animate-in` etc. —
    // assert on the utility name and on the keyframes they resolve to.
    for (const marker of [
      '.absolute',
      '.z-50',
      'data-open\\:animate-in',
      'data-closed\\:animate-out',
      'data-open\\:slide-in-from-right',
      'data-closed\\:slide-out-to-right',
      '@keyframes enter',
      '@keyframes exit',
      'background-color: var(--popover)',
      '[data-applet="widget:consumer"]'
    ]) {
      expect(css).toContain(marker)
    }
  })
})
