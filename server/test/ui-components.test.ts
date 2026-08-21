import { describe, expect, test } from 'bun:test'
import { join } from 'path'

import {
  APPLET_PORTAL_SOURCE,
  UI_COMPONENTS,
  UI_COMPONENT_NAMES,
  planUiWrites,
  resolveUiComponentRequest,
  suggestUiComponents,
  transformUiComponentSource
} from '../ui-components'

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

describe('catalog', () => {
  test('every entry has a description and at least one registry item', () => {
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
