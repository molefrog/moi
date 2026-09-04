import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'bun:test'

import * as RegistryButton from '@/ui-components/button'
import * as RegistrySpinner from '@/ui-components/spinner'
import * as RegistryTooltip from '@/ui-components/tooltip'

import * as HostButton from './button'
import * as HostSpinner from './spinner'
import * as HostTooltip from './tooltip'

test('host primitives re-export the shared registry implementations', () => {
  expect(HostButton.Button).toBe(RegistryButton.Button)
  expect(HostButton.buttonVariants).toBe(RegistryButton.buttonVariants)
  expect(HostSpinner.Spinner).toBe(RegistrySpinner.Spinner)
  expect(HostTooltip.Tooltip).toBe(RegistryTooltip.Tooltip)
  expect(HostTooltip.TooltipProvider).toBe(RegistryTooltip.TooltipProvider)
  expect(HostTooltip.TooltipTrigger).toBe(RegistryTooltip.TooltipTrigger)
  expect(HostTooltip.TooltipContent).toBe(RegistryTooltip.TooltipContent)
})

test('shared Spinner keeps its accessible label and accepts icon props', () => {
  const html = renderToStaticMarkup(<HostSpinner.Spinner aria-label="Saving" stroke={1.5} />)

  expect(html).toContain('role="status"')
  expect(html).toContain('aria-label="Saving"')
  expect(html).toContain('stroke-width="1.5"')
})
