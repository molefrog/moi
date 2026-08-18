import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, test } from 'bun:test'

import { TooltipProvider } from '@/client/components/ui/tooltip'
import { UPDATE_ACTIVE_AGENT_MESSAGE } from '@/lib/update'
import type { UpdateStatus } from '@/lib/types'

import { updateKey } from './api'
import { getUpdateButtonState, shouldReloadAfterUpdate, Update } from './Update'

const available: UpdateStatus = {
  runningVersion: '0.5.2',
  availableVersion: '0.6.0'
}

function renderControl(status: UpdateStatus): string {
  const queryClient = new QueryClient()
  queryClient.setQueryData(updateKey, status)

  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(TooltipProvider, null, createElement(Update))
    )
  )
}

describe('Update', () => {
  test('stays hidden for non-actionable states', () => {
    expect(
      renderControl({
        runningVersion: '0.6.0',
        availableVersion: null
      })
    ).toBe('')
  })

  test('renders a direct update button without a popover trigger', () => {
    const html = renderControl(available)

    expect(html).toContain('tabler-icon-download')
    expect(html).toContain('aria-label="Update"')
    expect(html).not.toContain('data-slot="popover-trigger"')
    expect(html).not.toContain('disabled=""')
  })
})

test('derives blocked, updating, and restarting button states', () => {
  expect(getUpdateButtonState(true, false, false)).toEqual({
    busy: false,
    blocked: true,
    label: UPDATE_ACTIVE_AGENT_MESSAGE
  })
  expect(getUpdateButtonState(false, true, false)).toEqual({
    busy: true,
    blocked: false,
    label: 'Updating'
  })
  expect(getUpdateButtonState(false, false, true)).toEqual({
    busy: true,
    blocked: false,
    label: 'Restarting'
  })
})

test('reloads only when the new server version is running', () => {
  expect(shouldReloadAfterUpdate(available, '0.6.0')).toBe(false)
  expect(
    shouldReloadAfterUpdate(
      {
        runningVersion: '0.6.0',
        availableVersion: null
      },
      '0.6.0'
    )
  ).toBe(true)
})
