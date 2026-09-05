import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'bun:test'

import * as RegistryButton from '@/ui-components/button'
import * as RegistryCollapsible from '@/ui-components/collapsible'
import * as RegistryDialog from '@/ui-components/dialog'
import * as RegistryDropdownMenu from '@/ui-components/dropdown-menu'
import * as RegistryHoverCard from '@/ui-components/hover-card'
import * as RegistryInput from '@/ui-components/input'
import * as RegistryPopover from '@/ui-components/popover'
import * as RegistrySkeleton from '@/ui-components/skeleton'
import * as RegistrySlider from '@/ui-components/slider'
import * as RegistrySpinner from '@/ui-components/spinner'
import * as RegistrySwitch from '@/ui-components/switch'
import * as RegistryTabs from '@/ui-components/tabs'
import * as RegistryTextarea from '@/ui-components/textarea'
import * as RegistryTooltip from '@/ui-components/tooltip'

import * as HostButton from './button'
import * as HostCollapsible from './collapsible'
import * as HostDialog from './dialog'
import * as HostDropdownMenu from './dropdown-menu'
import * as HostHoverCard from './hover-card'
import * as HostInput from './input'
import * as HostPopover from './popover'
import * as HostSkeleton from './skeleton'
import * as HostSlider from './slider'
import * as HostSpinner from './spinner'
import * as HostSwitch from './switch'
import * as HostTabs from './tabs'
import * as HostTextarea from './textarea'
import * as HostTooltip from './tooltip'

test('host primitives re-export the shared registry implementations', () => {
  expect(HostButton).toEqual(RegistryButton)
  expect(HostCollapsible).toEqual(RegistryCollapsible)
  expect(HostDialog).toEqual(RegistryDialog)
  expect(HostDropdownMenu).toEqual(RegistryDropdownMenu)
  expect(HostHoverCard).toEqual(RegistryHoverCard)
  expect(HostInput).toEqual(RegistryInput)
  expect(HostPopover).toEqual(RegistryPopover)
  expect(HostSkeleton).toEqual(RegistrySkeleton)
  expect(HostSlider).toEqual(RegistrySlider)
  expect(HostSpinner).toEqual(RegistrySpinner)
  expect(HostSwitch).toEqual(RegistrySwitch)
  expect(HostTabs).toEqual(RegistryTabs)
  expect(HostTextarea).toEqual(RegistryTextarea)
  expect(HostTooltip).toEqual(RegistryTooltip)
})

test('shared Tabs forwards vertical orientation to Base UI', () => {
  const html = renderToStaticMarkup(
    <HostTabs.Tabs defaultValue="overview" orientation="vertical">
      <HostTabs.TabsList>
        <HostTabs.TabsTrigger value="overview">Overview</HostTabs.TabsTrigger>
        <HostTabs.TabsTrigger value="activity">Activity</HostTabs.TabsTrigger>
      </HostTabs.TabsList>
      <HostTabs.TabsContent value="overview">Overview content</HostTabs.TabsContent>
    </HostTabs.Tabs>
  )

  expect(html).toContain('data-orientation="vertical"')
  expect(html).not.toContain('data-orientation="horizontal"')
})

test('shared Slider preserves custom content inside the control', () => {
  const html = renderToStaticMarkup(
    <HostSlider.Slider value={[2]} max={5}>
      <span data-slot="slider-marks">Effort marks</span>
    </HostSlider.Slider>
  )

  expect(html).toContain('data-slot="slider-marks"')
  expect(html).toContain('Effort marks')
  expect(html.indexOf('data-slot="slider-marks"')).toBeGreaterThan(
    html.indexOf('data-slot="slider-track"')
  )
  expect(html.indexOf('data-slot="slider-marks"')).toBeLessThan(
    html.indexOf('data-slot="slider-thumb"')
  )
})

test('shared Slider uses array values for thumb count and otherwise renders one thumb', () => {
  for (const props of [
    { value: 2 },
    { defaultValue: 65 },
    { min: 10 },
    {},
    { value: [2] },
    { defaultValue: [2] },
    { value: [2], defaultValue: [1, 3] }
  ]) {
    const html = renderToStaticMarkup(<HostSlider.Slider {...props} />)
    expect(html.match(/data-slot="slider-thumb"/g)).toHaveLength(1)
  }

  for (const props of [
    { value: [1, 3] },
    { defaultValue: [1, 3] },
    { value: 0, defaultValue: [1, 3] }
  ]) {
    const html = renderToStaticMarkup(<HostSlider.Slider {...props} />)
    expect(html.match(/data-slot="slider-thumb"/g)).toHaveLength(2)
  }
})

test('shared Spinner keeps its accessible label and accepts icon props', () => {
  const html = renderToStaticMarkup(<HostSpinner.Spinner aria-label="Saving" stroke={1.5} />)

  expect(html).toContain('role="status"')
  expect(html).toContain('aria-label="Saving"')
  expect(html).toContain('stroke-width="1.5"')
})

test('shared Popover forwards keepMounted to the portal', () => {
  const portal = HostPopover.PopoverContent({
    keepMounted: true,
    children: 'Popover content'
  })
  const positioner = portal.props.children
  const popup = positioner.props.children

  expect(portal.props.keepMounted).toBe(true)
  expect(popup.props.children).toBe('Popover content')
  expect(popup.props).not.toHaveProperty('keepMounted')
})
