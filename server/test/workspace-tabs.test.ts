import { describe, expect, test } from 'bun:test'

import type { ViewInfo } from '@/lib/types'

import { assembleWorkspaceTabs } from '../views'

describe('assembleWorkspaceTabs', () => {
  test('static tabs alone when the workspace has no views', () => {
    expect(assembleWorkspaceTabs([])).toEqual([
      { id: 'agent', title: 'Agent' },
      { id: 'widgets', title: 'Widgets' },
      { id: 'scratchpad', title: 'Scratchpad' }
    ])
  })

  test('appends views in list order with titles and declared params', () => {
    const views: ViewInfo[] = [
      {
        id: 'shop',
        config: { title: 'Shop', params: { product: 'Product slug shown in the detail pane' } }
      },
      { id: 'crm', config: { title: '' } }
    ]
    const tabList = assembleWorkspaceTabs(views)
    expect(tabList.slice(3)).toEqual([
      {
        id: 'view:shop',
        title: 'Shop',
        params: { product: 'Product slug shown in the detail pane' }
      },
      // No title falls back to the id; no params key when none are declared.
      { id: 'view:crm', title: 'crm' }
    ])
  })
})
