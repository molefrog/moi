import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'path'

import { buildApplet } from '../bundler/build-applet'
import {
  APPLET_PORTAL_SOURCE,
  UI_COMPONENTS,
  UI_COMPONENT_NAMES,
  fetchUiComponentDocs,
  fetchUiComponents,
  partitionUiWrites,
  planUiWrites,
  registryItemName,
  resolveUiComponentRequest,
  suggestUiComponents,
  transformUiComponentSource,
  uiComponentFiles
} from '../ui-components'

const REPO_ROOT = join(import.meta.dir, '../..')

async function loadDrawerRegistryItem() {
  const { loadRegistryItem } = await import('shadcn/registry')
  const item = await loadRegistryItem('drawer', { cwd: REPO_ROOT })
  const file = item.files?.find(candidate => candidate.path.endsWith('/drawer.tsx'))
  if (!file?.content) throw new Error('Drawer registry source is missing')
  return { item, source: file.content }
}

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
  test('every entry has a description and registry items', () => {
    for (const name of UI_COMPONENT_NAMES) {
      const entry = UI_COMPONENTS[name]
      expect(entry.description.length).toBeGreaterThan(0)
      expect(entry.registryItems.length).toBeGreaterThan(0)
      if (entry.docs) expect(entry.docs).toBe('registry')
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

describe('moi registry', () => {
  test('loads its single Drawer item from the local source registry', async () => {
    const { loadRegistry } = await import('shadcn/registry')
    const registry = await loadRegistry({ cwd: REPO_ROOT })

    expect(registry).toMatchObject({ name: 'moi', homepage: 'https://moi.computer' })
    expect(registry.items).toHaveLength(1)
    expect(registry.items[0]).toMatchObject({
      name: 'drawer',
      title: 'Drawer',
      type: 'registry:ui',
      dependencies: ['@base-ui/react', '@tabler/icons-react', 'clsx', 'tailwind-merge'],
      files: [
        { path: 'ui-components/drawer.tsx', type: 'registry:ui' },
        { path: 'ui-components/utils.ts', type: 'registry:lib' }
      ]
    })
    expect(registry.items[0]?.registryDependencies).toBeUndefined()
    expect(registry.items[0]?.docs).toContain('Every DrawerContent must contain a DrawerTitle')
  })

  test('drawer resolves to the local-first registry name', () => {
    const request = resolveUiComponentRequest(['drawer'])

    expect(request.entries).toEqual(['drawer'])
    expect(request.registryItems).toEqual(['drawer'])
    expect(request.unknown).toEqual([])
  })

  test('mixes with registry entries in one request', () => {
    const request = resolveUiComponentRequest(['drawer', 'button', 'drawer'])

    expect(request.entries).toEqual(['drawer', 'button'])
    expect(request.registryItems).toEqual(['drawer', 'button'])
  })

  test('uses the final address segment for installed files', () => {
    expect(registryItemName('molefrog/moi/drawer')).toBe('drawer')
    expect(registryItemName('molefrog/moi/drawer#v1.0.0')).toBe('drawer')
    expect(uiComponentFiles('drawer')).toEqual(['drawer.tsx'])
    expect(uiComponentFiles('button')).toEqual(['button.tsx'])
    expect(uiComponentFiles('date-picker')).toEqual(['calendar.tsx', 'popover.tsx', 'button.tsx'])
  })

  test('plans local registry files as requested transformed writes', () => {
    const plans = planUiWrites({
      files: [
        { name: 'utils.ts', content: 'utils' },
        { name: 'drawer.tsx', content: 'drawer' }
      ],
      requestedItems: ['drawer'],
      uiDir: '/ws/.moi/ui',
      exists: () => false
    })

    const byName = new Map(plans.map(plan => [plan.name, plan]))
    expect(byName.get('drawer.tsx')).toMatchObject({ support: false, verbatim: false })
    expect(byName.get('utils.ts')).toMatchObject({ support: true, verbatim: false })
    expect(byName.get('applet-portal.tsx')).toMatchObject({ support: true, verbatim: true })
  })

  test('loads Drawer and its docs locally without calling the remote resolver', async () => {
    let remoteCalled = false
    const originalFetch = globalThis.fetch
    globalThis.fetch = () => Promise.reject(new Error('network access attempted'))

    try {
      const fetched = await fetchUiComponents(['drawer'], {
        resolveRemote: async () => {
          remoteCalled = true
          throw new Error('remote resolver called')
        }
      })
      const docs = await fetchUiComponentDocs('drawer')

      expect(remoteCalled).toBeFalse()
      expect(fetched.files.map(file => file.name)).toEqual(['drawer.tsx', 'utils.ts'])
      expect(fetched.dependencies).toEqual([
        '@base-ui/react',
        '@tabler/icons-react',
        'clsx',
        'tailwind-merge'
      ])
      expect(docs).toContain('Every DrawerContent must contain a DrawerTitle')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('routes missing local items to shadcn', async () => {
    let remoteNames: string[] = []
    const fetched = await fetchUiComponents(['button'], {
      resolveRemote: async names => {
        remoteNames = names
        return {
          files: [{ name: 'button.tsx', content: 'button' }],
          dependencies: ['@base-ui/react']
        }
      }
    })

    expect(remoteNames).toEqual(['button'])
    expect(fetched).toEqual({
      files: [{ name: 'button.tsx', content: 'button' }],
      dependencies: ['@base-ui/react']
    })
  })

  test('fails when a declared local source file is missing', async () => {
    const registryRoot = mkdtempSync(join(import.meta.dir, 'missing-registry-source-'))
    writeFileSync(
      join(registryRoot, 'registry.json'),
      JSON.stringify({
        $schema: 'https://ui.shadcn.com/schema/registry.json',
        name: 'test',
        homepage: 'https://example.com',
        items: [
          {
            name: 'drawer',
            type: 'registry:ui',
            files: [{ path: 'missing.tsx', type: 'registry:ui' }]
          }
        ]
      })
    )
    let remoteCalled = false

    try {
      await expect(
        fetchUiComponents(['drawer'], {
          registryRoot,
          resolveRemote: async () => {
            remoteCalled = true
            return { files: [], dependencies: [] }
          }
        })
      ).rejects.toThrow()
      expect(remoteCalled).toBeFalse()
    } finally {
      rmSync(registryRoot, { recursive: true, force: true })
    }
  })

  test('merges local and remote results with local files winning', async () => {
    const fetched = await fetchUiComponents(['drawer', 'button'], {
      resolveRemote: async () => ({
        files: [
          { name: 'utils.ts', content: 'remote utils' },
          { name: 'button.tsx', content: 'button' }
        ],
        dependencies: ['@base-ui/react', 'class-variance-authority']
      })
    })

    expect(fetched.files.map(file => file.name)).toEqual(['drawer.tsx', 'utils.ts', 'button.tsx'])
    expect(fetched.files.find(file => file.name === 'utils.ts')?.content).toContain('twMerge')
    expect(fetched.dependencies).toEqual([
      '@base-ui/react',
      '@tabler/icons-react',
      'class-variance-authority',
      'clsx',
      'tailwind-merge'
    ])
  })

  test('ships the local registry with the npm package', async () => {
    const packageJson = (await Bun.file(join(REPO_ROOT, 'package.json')).json()) as {
      files: string[]
    }

    expect(packageJson.files).toContain('registry.json')
    expect(packageJson.files).toContain('ui-components')
  })
})

describe('drawer source', () => {
  test('keeps its local utils import when installed', async () => {
    const { source } = await loadDrawerRegistryItem()
    const installed = await transformUiComponentSource('drawer.tsx', source)

    expect(source).toContain("from './utils'")
    expect(installed).toContain("from './utils'")
    expect(installed).toContain("from '@tabler/icons-react'")
    expect(installed).toContain("from '@base-ui/react/dialog'")
    expect(installed).not.toContain('@/registry')
    expect(installed).not.toContain('IconPlaceholder')
    expect(installed).not.toContain('lucide')
    expect(installed).toContain('<DrawerPrimitive.Portal container={container}>')
    expect(installed).not.toContain('AppletPortal')
  })

  test('scopes itself to the applet root, never the page', async () => {
    const { source } = await loadDrawerRegistryItem()

    // Portals into the nearest [data-applet] element and positions against
    // it: no body portal, no fixed positioning, and no page-modal state
    // (trap-focus keeps the rest of the workspace scrollable and clickable).
    expect(source).toContain("closest<HTMLElement>('[data-applet]')")
    expect(source).toContain('<DrawerPrimitive.Portal container={container}>')
    expect(source).toContain("modal = 'trap-focus'")
    expect(source).toContain("side = 'right'")
    expect(source).toContain('data-slot="drawer-overlay"')
    expect(source).not.toContain('document.body')
    expect(source).not.toMatch(/\bfixed\b/)
    // Not wrapped by the body-portal helper either — that would defeat it.
    expect(source).not.toContain('AppletPortal')
  })

  test('exports and documents the sheet-shaped parts', async () => {
    const { item, source } = await loadDrawerRegistryItem()

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
      expect(source).toContain(`function ${part}(`)
      expect(source).toMatch(new RegExp(`^  ${part},?$`, 'm'))
      expect(item.docs).toContain(part)
    }
  })
})

describe('drawer build', () => {
  // The transformed registry source compiles the way an installed
  // `.moi/ui/drawer.tsx` would. It is laid out like a workspace — `ui/` beside
  // `views/` — inside the repo tree so the component dependencies resolve
  // against the repo's node_modules.
  let root: string

  const CONSUMER = [
    "import { Drawer, DrawerBody, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle, DrawerTrigger } from '../ui/drawer'",
    'export default function Consumer() {',
    '  return (',
    '    <Drawer>',
    '      <DrawerTrigger>Open</DrawerTrigger>',
    '      <DrawerContent>',
    '        <DrawerHeader><DrawerTitle>Title</DrawerTitle><DrawerDescription>Desc</DrawerDescription></DrawerHeader>',
    '        <DrawerBody>body</DrawerBody>',
    '        <DrawerFooter><DrawerClose>Done</DrawerClose></DrawerFooter>',
    '      </DrawerContent>',
    '    </Drawer>',
    '  )',
    '}'
  ].join('\n')

  const injectedCss = (js: string): string => {
    const match = js.match(/^\(css => \{[\s\S]*?\}\)\((".*")\);/m)
    return match ? (JSON.parse(match[1]) as string) : ''
  }

  beforeAll(async () => {
    const { source } = await loadDrawerRegistryItem()
    const installed = await transformUiComponentSource('drawer.tsx', source)
    root = mkdtempSync(join(import.meta.dir, 'drawer-ws-'))
    mkdirSync(join(root, 'ui'))
    mkdirSync(join(root, 'views'))
    writeFileSync(
      join(root, 'ui', 'utils.ts'),
      [
        'import { clsx, type ClassValue } from "clsx"',
        'import { twMerge } from "tailwind-merge"',
        'export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)) }'
      ].join('\n')
    )
    writeFileSync(join(root, 'ui', 'drawer.tsx'), installed)
    writeFileSync(join(root, 'views', 'consumer.tsx'), CONSUMER)
    // Same first-build quirk as build-applet.test.ts: under `bun test` the very
    // first Bun.build with this option combo fails to resolve the entry.
    await buildApplet(join(root, 'views', 'consumer.tsx'), root, 'view').catch(() => {})
  })

  afterAll(() => {
    rmSync(root, { recursive: true, force: true })
  })

  test('compiles into a scoped view', async () => {
    const result = await buildApplet(join(root, 'views', 'consumer.tsx'), root, 'view')
    const css = injectedCss(result.js)

    expect(result.js).toContain('drawer-content')
    expect(css).toContain('[data-applet="view:consumer"]')
  })
})
