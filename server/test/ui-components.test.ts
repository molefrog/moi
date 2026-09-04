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

async function loadRegistryFile(itemName: string, fileName: string) {
  const { loadRegistryItem } = await import('shadcn/registry')
  const item = await loadRegistryItem(itemName, { cwd: REPO_ROOT })
  const file = item.files?.find(candidate => candidate.path.endsWith(`/${fileName}`))
  if (!file?.content) throw new Error(`${fileName} is missing from the ${itemName} registry item`)
  return file.content
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
      <PopoverPrimitive.Positioner data-preserved="positioner">
        <PopoverPrimitive.Popup className={cn("surface", className)} {...props} />
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
    expect(out).toContain('<PopoverPrimitive.Positioner data-preserved="positioner">')
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

  test('rewrites imports without adding a portal helper', async () => {
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
  test('loads Button and Drawer from the local source registry', async () => {
    const { loadRegistry } = await import('shadcn/registry')
    const registry = await loadRegistry({ cwd: REPO_ROOT })
    const button = registry.items.find(item => item.name === 'button')
    const drawer = registry.items.find(item => item.name === 'drawer')

    expect(registry).toMatchObject({ name: 'moi', homepage: 'https://moi.computer' })
    expect(registry.items).toHaveLength(2)
    expect(button).toMatchObject({
      name: 'button',
      title: 'Button',
      type: 'registry:ui',
      dependencies: ['@base-ui/react', 'class-variance-authority', 'clsx', 'tailwind-merge'],
      files: [
        { path: 'ui-components/button.tsx', type: 'registry:ui' },
        { path: 'ui-components/utils.ts', type: 'registry:lib' }
      ]
    })
    expect(button?.docs).toContain('# Button')
    expect(drawer).toMatchObject({
      name: 'drawer',
      title: 'Drawer',
      type: 'registry:ui',
      dependencies: ['@base-ui/react', '@tabler/icons-react', 'clsx', 'tailwind-merge'],
      registryDependencies: ['molefrog/moi/button'],
      files: [
        { path: 'ui-components/drawer.tsx', type: 'registry:ui' },
        { path: 'ui-components/utils.ts', type: 'registry:lib' }
      ]
    })
    expect(drawer?.docs).toContain('# Drawer')
  })

  test('drawer resolves to the local-first registry name', () => {
    const request = resolveUiComponentRequest(['drawer'])

    expect(request.entries).toEqual(['drawer'])
    expect(request.registryItems).toEqual(['drawer'])
    expect(request.unknown).toEqual([])
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
        { name: 'button.tsx', content: 'button' },
        { name: 'drawer.tsx', content: 'drawer' }
      ],
      requestedItems: ['drawer'],
      uiDir: '/ws/.moi/ui',
      exists: () => false
    })

    const byName = new Map(plans.map(plan => [plan.name, plan]))
    expect(byName.get('drawer.tsx')).toMatchObject({ support: false, verbatim: false })
    expect(byName.get('button.tsx')).toMatchObject({ support: true, verbatim: false })
    expect(byName.get('utils.ts')).toMatchObject({ support: true, verbatim: false })
    expect(byName.get('applet-portal.tsx')).toMatchObject({ support: true, verbatim: true })
  })

  test('loads Button, Drawer, and their docs without calling the remote resolver', async () => {
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
      const button = await fetchUiComponents(['button'], {
        resolveRemote: async () => {
          remoteCalled = true
          throw new Error('remote resolver called')
        }
      })
      const drawerDocs = await fetchUiComponentDocs('drawer')
      const buttonDocs = await fetchUiComponentDocs('button')

      expect(remoteCalled).toBeFalse()
      expect(fetched.files.map(file => file.name).sort()).toEqual([
        'button.tsx',
        'drawer.tsx',
        'utils.ts'
      ])
      expect(fetched.dependencies).toEqual([
        '@base-ui/react',
        '@tabler/icons-react',
        'class-variance-authority',
        'clsx',
        'tailwind-merge'
      ])
      expect(button.files.map(file => file.name).sort()).toEqual(['button.tsx', 'utils.ts'])
      expect(drawerDocs).toContain('# Drawer')
      expect(buttonDocs).toContain('# Button')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('routes missing local items to shadcn', async () => {
    let remoteNames: string[] = []
    const fetched = await fetchUiComponents(['accordion'], {
      resolveRemote: async names => {
        remoteNames = names
        return {
          files: [{ name: 'accordion.tsx', content: 'accordion' }],
          dependencies: ['@base-ui/react']
        }
      }
    })

    expect(remoteNames).toEqual(['accordion'])
    expect(fetched).toEqual({
      files: [{ name: 'accordion.tsx', content: 'accordion' }],
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

  test('uses the local Button when a remote component brings its own', async () => {
    const localButton = await loadRegistryFile('button', 'button.tsx')
    const localUtils = await loadRegistryFile('button', 'utils.ts')
    let remoteNames: string[] = []
    const fetched = await fetchUiComponents(['dialog'], {
      resolveRemote: async names => {
        remoteNames = names
        return {
          files: [
            { name: 'utils.ts', content: 'remote utils' },
            { name: 'button.tsx', content: 'remote button' },
            { name: 'dialog.tsx', content: 'dialog' }
          ],
          dependencies: ['@base-ui/react', 'class-variance-authority']
        }
      }
    })

    expect(remoteNames).toEqual(['dialog'])
    expect(fetched.files.map(file => file.name).sort()).toEqual([
      'button.tsx',
      'dialog.tsx',
      'utils.ts'
    ])
    expect(fetched.files.find(file => file.name === 'button.tsx')?.content).toBe(localButton)
    expect(fetched.files.find(file => file.name === 'utils.ts')?.content).toBe(localUtils)
    expect(fetched.dependencies).toEqual([
      '@base-ui/react',
      'class-variance-authority',
      'clsx',
      'tailwind-merge'
    ])
  })

  test('does not add Button to an unrelated remote component', async () => {
    const fetched = await fetchUiComponents(['accordion'], {
      resolveRemote: async () => ({
        files: [
          { name: 'utils.ts', content: 'remote utils' },
          { name: 'accordion.tsx', content: 'accordion' }
        ],
        dependencies: []
      })
    })

    expect(fetched.files.map(file => file.name).sort()).toEqual(['accordion.tsx', 'utils.ts'])
  })

  test('includes the local registry in the npm package whitelist', async () => {
    const packageJson = (await Bun.file(join(REPO_ROOT, 'package.json')).json()) as {
      files: string[]
    }

    expect(packageJson.files).toContain('registry.json')
    expect(packageJson.files).toContain('ui-components')
  })
})

describe('drawer source', () => {
  test('keeps its local imports when installed', async () => {
    const source = await loadRegistryFile('drawer', 'drawer.tsx')
    const installed = await transformUiComponentSource('drawer.tsx', source)

    expect(installed).toContain("from './button'")
    expect(installed).toContain("from './utils'")
    expect(installed).not.toContain('@/registry')
    expect(installed).not.toContain('AppletPortal')
  })

  test('uses the shared Button for its built-in close control', async () => {
    const source = await loadRegistryFile('drawer', 'drawer.tsx')

    expect(source).toContain('<DrawerClose')
    expect(source).toContain('<Button')
  })

  test('scopes itself to the applet root, never the page', async () => {
    const source = await loadRegistryFile('drawer', 'drawer.tsx')

    // Portals into the nearest [data-applet] element and positions against
    // it: no body portal, no fixed positioning, and no page-modal state
    // (trap-focus keeps the rest of the workspace scrollable and clickable).
    expect(source).toContain("closest<HTMLElement>('[data-applet]')")
    expect(source).toContain(
      '<DrawerPrimitive.Portal data-slot="drawer-portal" container={container}>'
    )
    expect(source).toContain("modal = 'trap-focus'")
    expect(source).toContain("swipeDirection = 'right'")
    expect(source).toContain('{modal === true && (')
    expect(source).not.toContain('document.body')
    // `fixed` would position the Drawer against the page instead of its view.
    expect(source).not.toMatch(/\bfixed\b/)
    expect(source).not.toContain('AppletPortal')
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
    "import { Button, buttonVariants } from '../ui/button'",
    'export default function Consumer() {',
    '  const linkClassName = buttonVariants({ variant: "link" })',
    '  return (',
    '    <Drawer>',
    '      <DrawerTrigger render={<Button variant="outline" />}>Open</DrawerTrigger>',
    '      <DrawerContent>',
    '        <DrawerHeader><DrawerTitle>Title</DrawerTitle><DrawerDescription>Desc</DrawerDescription></DrawerHeader>',
    '        <DrawerBody>body</DrawerBody>',
    '        <DrawerFooter>',
    '          <a className={linkClassName}>Help</a>',
    '          <Button size="xs">Save</Button>',
    '          <DrawerClose render={<Button size="icon-xs" />}>Done</DrawerClose>',
    '        </DrawerFooter>',
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
    const fetched = await fetchUiComponents(['drawer'])
    root = mkdtempSync(join(import.meta.dir, 'drawer-ws-'))
    mkdirSync(join(root, 'ui'))
    mkdirSync(join(root, 'views'))
    for (const file of fetched.files) {
      const content = file.name.endsWith('.tsx')
        ? await transformUiComponentSource(file.name, file.content)
        : file.content
      writeFileSync(join(root, 'ui', file.name), content)
    }
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
