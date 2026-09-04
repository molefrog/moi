import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'path'

import { buildApplet } from '../bundler/build-applet'
import {
  UI_COMPONENTS,
  UI_COMPONENT_NAMES,
  loadUiComponentDocs,
  loadUiComponents,
  partitionUiWrites,
  planUiWrites,
  registryItemName,
  resolveUiComponentRequest,
  suggestUiComponents,
  uiComponentFiles
} from '../ui-components'

const REPO_ROOT = join(import.meta.dir, '../..')
const SUPPORT_ITEMS = ['applet-portal', 'utils']
const PORTALLED_COMPONENTS = [
  'alert-dialog',
  'combobox',
  'context-menu',
  'dialog',
  'dropdown-menu',
  'hover-card',
  'popover',
  'select',
  'tooltip'
]

function packageName(specifier: string): string {
  if (!specifier.startsWith('@')) return specifier.split('@', 1)[0].split('/', 1)[0]
  const packageEnd = specifier.indexOf('@', specifier.indexOf('/') + 1)
  return packageEnd === -1
    ? specifier.split('/').slice(0, 2).join('/')
    : specifier.slice(0, packageEnd)
}

describe('resolveUiComponentRequest', () => {
  test('maps curated names to registry items, deduplicated', () => {
    const request = resolveUiComponentRequest(['button', 'popover', 'button'])

    expect(request.entries).toEqual(['button', 'popover'])
    expect(request.unknown).toEqual([])
  })

  test('collects unknown names and suggests close matches', () => {
    const request = resolveUiComponentRequest(['button', 'sidebar'])

    expect(request.entries).toEqual(['button'])
    expect(request.unknown).toEqual(['sidebar'])
    expect(suggestUiComponents('alertdialog')[0]).toBe('alert-dialog')
    expect(suggestUiComponents('tooltp')[0]).toBe('tooltip')
    expect(suggestUiComponents('combo')).toContain('combobox')
  })
})

describe('write planning', () => {
  const plan = (name: string, opts: { exists?: boolean; support?: boolean } = {}) => ({
    name,
    path: `/ws/.moi/ui/${name}`,
    content: name,
    exists: opts.exists ?? false,
    support: opts.support ?? false
  })

  test('marks requested files and resolved dependencies', () => {
    const plans = planUiWrites({
      files: [
        { name: 'field.tsx', content: 'field' },
        { name: 'label.tsx', content: 'label' },
        { name: 'utils.ts', content: 'utils' }
      ],
      requestedFiles: ['field.tsx'],
      uiDir: '/ws/.moi/ui',
      exists: path => path.endsWith('label.tsx')
    })

    const byName = new Map(plans.map(candidate => [candidate.name, candidate]))
    expect(byName.get('field.tsx')).toMatchObject({ support: false, exists: false })
    expect(byName.get('label.tsx')).toMatchObject({ support: true, exists: true })
    expect(byName.get('utils.ts')).toMatchObject({ support: true, exists: false })
  })

  test('skips existing requested files while writing new files', () => {
    const partition = partitionUiWrites(
      [
        plan('button.tsx', { exists: true }),
        plan('badge.tsx'),
        plan('utils.ts', { support: true, exists: true })
      ],
      false
    )

    expect(partition.write.map(candidate => candidate.name)).toEqual(['badge.tsx'])
    expect(partition.skipInstalled.map(candidate => candidate.name)).toEqual(['button.tsx'])
    expect(partition.keepSupport.map(candidate => candidate.name)).toEqual(['utils.ts'])
  })

  test('has nothing to write when every file exists', () => {
    const partition = partitionUiWrites(
      [
        plan('button.tsx', { exists: true }),
        plan('badge.tsx', { exists: true }),
        plan('utils.ts', { support: true, exists: true })
      ],
      false
    )

    expect(partition.write).toEqual([])
  })

  test('restores missing support files for an installed component', () => {
    const partition = partitionUiWrites(
      [plan('chart.tsx', { exists: true }), plan('card.tsx', { support: true })],
      false
    )

    expect(partition.write.map(candidate => candidate.name)).toEqual(['card.tsx'])
    expect(partition.skipInstalled.map(candidate => candidate.name)).toEqual(['chart.tsx'])
  })

  test('--force overwrites requested files and protects support files', () => {
    const partition = partitionUiWrites(
      [
        plan('button.tsx', { exists: true }),
        plan('badge.tsx'),
        plan('utils.ts', { support: true, exists: true })
      ],
      true
    )

    expect(partition.write.map(candidate => candidate.name)).toEqual(['button.tsx', 'badge.tsx'])
    expect(partition.keepSupport.map(candidate => candidate.name)).toEqual(['utils.ts'])
  })
})

describe('catalog', () => {
  test('exposes exactly the agreed public set', () => {
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
      'card',
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
      'toggle',
      'toggle-group',
      'tooltip'
    ])
  })

  test('keeps library items out of the public catalog', () => {
    for (const name of SUPPORT_ITEMS) expect(UI_COMPONENTS[name]).toBeUndefined()
    for (const name of UI_COMPONENT_NAMES) {
      expect(UI_COMPONENTS[name].description.length).toBeGreaterThan(0)
    }
  })

  test('uses the final registry address segment for installed files', () => {
    expect(registryItemName('molefrog/moi/drawer#v1.0.0')).toBe('drawer')
    expect(uiComponentFiles('drawer')).toEqual(['drawer.tsx'])
    expect(uiComponentFiles('card')).toEqual(['card.tsx'])
    expect(uiComponentFiles('data-table')).toEqual(['table.tsx'])
    expect(uiComponentFiles('date-picker')).toEqual(['calendar.tsx', 'popover.tsx', 'button.tsx'])
  })
})

describe('local registry', () => {
  test('declares imported packages and only uses supported item fields', async () => {
    const registry = (await Bun.file(join(REPO_ROOT, 'registry.json')).json()) as {
      items: Array<{
        name: string
        dependencies?: string[]
        files?: Array<{ path: string }>
        [key: string]: unknown
      }>
    }
    const unsupportedFields = ['devDependencies', 'css', 'cssVars', 'envVars', 'tailwind']
    const frameworkPackages = new Set(['react', 'react-dom'])
    const missingDependencies: string[] = []

    for (const item of registry.items) {
      for (const field of unsupportedFields) expect(item[field]).toBeUndefined()

      const declared = new Set((item.dependencies ?? []).map(packageName))
      for (const file of item.files ?? []) {
        const source = await Bun.file(join(REPO_ROOT, file.path)).text()
        for (const match of source.matchAll(/from ['"]([^'"]+)['"]/g)) {
          const specifier = match[1]
          if (specifier.startsWith('.')) continue
          const imported = packageName(specifier)
          if (!frameworkPackages.has(imported) && !declared.has(imported)) {
            missingDependencies.push(`${item.name}: ${imported}`)
          }
        }
      }
    }

    expect([...new Set(missingDependencies)]).toEqual([])
  })

  test('contains every public component and its internal support items', async () => {
    const { loadRegistry } = await import('shadcn/registry')
    const registry = await loadRegistry({ cwd: REPO_ROOT })
    const names = new Set(registry.items.map(item => item.name))

    expect(registry).toMatchObject({ name: 'moi', homepage: 'https://moi.computer' })
    expect(registry.items).toHaveLength(46)
    for (const name of UI_COMPONENT_NAMES) expect(names.has(name)).toBeTrue()
    for (const name of SUPPORT_ITEMS) expect(names.has(name)).toBeTrue()
  })

  test('resolves the complete catalog and docs without network access', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = Object.assign(() => Promise.reject(new Error('network access attempted')), {
      preconnect: originalFetch.preconnect
    }) as typeof fetch

    try {
      for (const name of UI_COMPONENT_NAMES) {
        const request = resolveUiComponentRequest([name])
        const resolved = await loadUiComponents(request.entries)
        const files = new Set(resolved.files.map(file => file.name))
        const missingItems = request.entries
          .flatMap(uiComponentFiles)
          .filter(file => !files.has(file))
        const missingImports: string[] = []
        for (const file of resolved.files) {
          for (const match of file.content.matchAll(/from ['"](\.\/[^'"]+)['"]/g)) {
            const imported = match[1].slice(2)
            if (!files.has(`${imported}.tsx`) && !files.has(`${imported}.ts`)) {
              missingImports.push(`${file.name}: ${match[1]}`)
            }
          }
        }

        expect(missingItems).toEqual([])
        expect(missingImports).toEqual([])
        expect((await loadUiComponentDocs(name)).trim().length).toBeGreaterThan(0)
      }
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('resolves recipe components and npm dependencies', async () => {
    const datePicker = await loadUiComponents(['date-picker'])
    const datePickerFiles = new Set(datePicker.files.map(file => file.name))
    expect(datePickerFiles.has('calendar.tsx')).toBeTrue()
    expect(datePickerFiles.has('popover.tsx')).toBeTrue()
    expect(datePickerFiles.has('button.tsx')).toBeTrue()

    const dataTable = await loadUiComponents(['data-table'])
    expect(dataTable.files.some(file => file.name === 'table.tsx')).toBeTrue()
    expect(dataTable.dependencies).toContain('@tanstack/react-table')
  })

  test('ships install-ready relative imports and scoped portals', async () => {
    const request = resolveUiComponentRequest(UI_COMPONENT_NAMES)
    const resolved = await loadUiComponents(request.entries)
    const names = new Set(resolved.files.map(file => file.name))
    const invalidSources: string[] = []
    const missingImports: string[] = []

    for (const file of resolved.files) {
      if (file.content.includes('@/') || file.content.includes('IconPlaceholder')) {
        invalidSources.push(file.name)
      }
      for (const match of file.content.matchAll(/from ['"](\.\/[^'"]+)['"]/g)) {
        const imported = match[1].slice(2)
        if (!names.has(`${imported}.tsx`) && !names.has(`${imported}.ts`)) {
          missingImports.push(`${file.name}: ${match[1]}`)
        }
      }
    }
    expect(invalidSources).toEqual([])
    expect(missingImports).toEqual([])

    for (const name of PORTALLED_COMPONENTS) {
      const source = resolved.files.find(file => file.name === `${name}.tsx`)?.content
      expect(source).toContain('./applet-portal')
      expect(source).toContain('<AppletPortal')
    }
  })

  test('fails clearly for a missing item', async () => {
    await expect(loadUiComponents(['missing-component'])).rejects.toThrow(
      'Registry item "missing-component" was not found'
    )
  })

  test('fails when a declared source file is missing', async () => {
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

    try {
      await expect(loadUiComponents(['drawer'], registryRoot)).rejects.toThrow()
    } finally {
      rmSync(registryRoot, { recursive: true, force: true })
    }
  })

  test('includes sources and docs in the npm package whitelist', async () => {
    const packageJson = (await Bun.file(join(REPO_ROOT, 'package.json')).json()) as {
      files: string[]
    }

    expect(packageJson.files).toContain('registry.json')
    expect(packageJson.files).toContain('ui-components')
  })
})

describe('moi components', () => {
  test('Drawer keeps its view scope and shared close Button', async () => {
    const resolved = await loadUiComponents(['drawer'])
    const source = resolved.files.find(file => file.name === 'drawer.tsx')?.content ?? ''

    expect(source).toContain("from './button'")
    expect(source).toContain("closest<HTMLElement>('[data-applet]')")
    expect(source).toContain(
      '<DrawerPrimitive.Portal data-slot="drawer-portal" container={container}>'
    )
    expect(source).toContain('<DrawerClose')
    expect(source).toContain('<Button')
    expect(source).not.toContain('document.body')
    expect(source).not.toContain('AppletPortal')
  })

  let buildRoot: string

  beforeAll(async () => {
    const request = resolveUiComponentRequest(UI_COMPONENT_NAMES)
    const resolved = await loadUiComponents(request.entries)
    buildRoot = mkdtempSync(join(import.meta.dir, 'ui-registry-ws-'))
    mkdirSync(join(buildRoot, 'ui'))
    mkdirSync(join(buildRoot, 'views'))

    for (const file of resolved.files) writeFileSync(join(buildRoot, 'ui', file.name), file.content)

    const modules = resolved.files
      .filter(file => file.name.endsWith('.tsx'))
      .map(file => file.name.slice(0, -4))
      .sort()
    const imports = modules.map(
      (name, index) => `import * as Component${index} from '../ui/${name}'`
    )
    const references = modules.map((_, index) => `Component${index}`).join(', ')
    const consumer = [
      ...imports,
      "import { Button } from '../ui/button'",
      "import { Drawer, DrawerBody, DrawerContent, DrawerTitle, DrawerTrigger } from '../ui/drawer'",
      'export default function RegistryConsumer() {',
      `  void [${references}]`,
      '  return (',
      '    <Drawer>',
      '      <DrawerTrigger render={<Button size="xs" />}>Open</DrawerTrigger>',
      '      <DrawerContent>',
      '        <DrawerTitle>Details</DrawerTitle>',
      '        <DrawerBody>Body</DrawerBody>',
      '      </DrawerContent>',
      '    </Drawer>',
      '  )',
      '}'
    ].join('\n')
    writeFileSync(join(buildRoot, 'views', 'registry-consumer.tsx'), consumer)

    // Same first-build quirk covered by build-applet.test.ts.
    await buildApplet(join(buildRoot, 'views', 'registry-consumer.tsx'), buildRoot, 'view').catch(
      () => {}
    )
  })

  afterAll(() => {
    rmSync(buildRoot, { recursive: true, force: true })
  })

  test('installs and builds every component module in an applet', async () => {
    const result = await buildApplet(
      join(buildRoot, 'views', 'registry-consumer.tsx'),
      buildRoot,
      'view'
    )

    expect(result.js).toContain('drawer-content')
    expect(result.js).toContain('data-applet')
  })
})
