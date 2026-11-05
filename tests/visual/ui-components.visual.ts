import { expect, type Locator, type Page, takeSnapshot } from '@uiverify/bun'

import registry from '@/registry.json' with { type: 'json' }

import { suite } from './fixtures'

const { describe, test } = suite(import.meta.path)

const components = registry.items.filter(item => item.type === 'registry:ui')

type State = {
  name: string
  act: (page: Page) => Promise<void>
  shows: (page: Page) => Locator
}

const open = (act: State['act'], shows: State['shows']): State => ({ name: 'open', act, shows })

// The states a preview reaches by interaction, captured besides its resting
// state: overlays opened, and controls switched to their other value.
const STATES: Record<string, State[]> = {
  accordion: [
    {
      name: 'second item open',
      act: page => page.getByRole('button', { name: 'Can I return it?' }).click(),
      shows: page => page.getByText('Unused items can be returned within 30 days.')
    }
  ],
  'alert-dialog': [
    open(
      page => page.getByRole('button', { name: 'Delete order' }).click(),
      page => page.getByText('Delete this order?')
    )
  ],
  carousel: [
    {
      name: 'next slide',
      act: page => page.getByRole('button', { name: 'Next slide' }).click(),
      shows: page => page.getByRole('button', { name: 'Previous slide' })
    }
  ],
  collapsible: [
    open(
      page => page.getByRole('button', { name: 'Show' }).click(),
      page => page.getByRole('button', { name: 'Hide' })
    )
  ],
  combobox: [
    open(
      page => page.getByPlaceholder('Choose a framework', { exact: true }).click(),
      page => page.getByRole('option').first()
    ),
    {
      name: 'no matches',
      act: page => page.getByPlaceholder('Choose a framework', { exact: true }).fill('cobol'),
      shows: page => page.getByText('No matches.')
    }
  ],
  'context-menu': [
    open(
      page => page.getByText('Right-click here').click({ button: 'right' }),
      page => page.getByRole('menuitem', { name: 'Duplicate' })
    )
  ],
  dialog: [
    open(
      page => page.getByRole('button', { name: 'Open dialog' }).click(),
      page => page.getByText('Edit order')
    )
  ],
  drawer: [
    open(
      page => page.getByRole('button', { name: 'Open drawer' }).click(),
      page => page.getByText('Mira Chen')
    )
  ],
  'dropdown-menu': [
    open(
      page => page.getByRole('button', { name: 'Open menu' }).click(),
      page => page.getByRole('menuitem', { name: 'Duplicate' })
    ),
    {
      name: 'submenu',
      act: async page => {
        await page.getByRole('button', { name: 'Open menu' }).click()
        await page.getByRole('menuitem', { name: 'Move to' }).hover()
      },
      shows: page => page.getByRole('menuitem', { name: 'Archive' })
    }
  ],
  'hover-card': [
    open(
      page => page.getByRole('button', { name: 'Hover for details' }).hover(),
      page => page.getByText('Five orders since March.')
    )
  ],
  popover: [
    open(
      page => page.getByRole('button', { name: 'Open popover' }).click(),
      page => page.getByText('Delivery details')
    )
  ],
  'radio-group': [
    {
      name: 'second option',
      act: page => page.getByRole('radio', { name: 'Express delivery' }).click(),
      shows: page => page.getByRole('radio', { name: 'Express delivery', checked: true })
    }
  ],
  select: [
    open(
      page => page.getByRole('combobox').click(),
      page => page.getByRole('option').first()
    )
  ],
  tabs: [
    {
      name: 'second tab',
      act: page => page.getByRole('tab', { name: 'Activity' }).click(),
      shows: page => page.getByRole('tab', { name: 'Activity', selected: true })
    }
  ],
  toggle: [
    {
      name: 'pressed',
      act: page => page.getByRole('button', { name: 'Toggle bold' }).click(),
      shows: page => page.getByRole('button', { name: 'Toggle bold', pressed: true })
    }
  ],
  tooltip: [
    open(
      page => page.getByRole('button', { name: 'Hover', exact: true }).hover(),
      page => page.getByText('Open order details')
    )
  ]
}

async function showComponent(page: Page, name: string) {
  await page.goto(`/#ui/${name}`)
  await expect(page.locator('main > *').first()).toBeAttached()
}

describe('UI components', { viewports: { '': { width: 800, height: 600 } } }, () => {
  for (const component of components) {
    test(component.title, async page => {
      await showComponent(page, component.name)
      await takeSnapshot()
    })

    for (const state of STATES[component.name] ?? []) {
      test(`${component.title}, ${state.name}`, async page => {
        await showComponent(page, component.name)
        await state.act(page)
        await expect(state.shows(page)).toBeVisible()
        await takeSnapshot()
      })
    }
  }
})
