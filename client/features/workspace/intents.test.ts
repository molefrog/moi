import { describe, expect, test } from 'bun:test'

import { bindWorkspaceIntents, focusTab, getTabParams, intentsStore } from './intents'
import type { WorkspaceTabId } from '@/lib/types'

describe('intents store', () => {
  test('tab params default to a stable empty object', () => {
    expect(getTabParams('ws-1', 'view:none')).toEqual({})
    expect(getTabParams('ws-1', 'view:none')).toBe(getTabParams('ws-2', 'view:other'))
  })

  test('setTabParams keys per workspace and tab, replacing wholesale', () => {
    intentsStore.getState().setTabParams('ws-1', 'view:shop', { product: 'scarf' })
    intentsStore.getState().setTabParams('ws-2', 'view:shop', { product: 'hat' })
    expect(getTabParams('ws-1', 'view:shop')).toEqual({ product: 'scarf' })
    expect(getTabParams('ws-2', 'view:shop')).toEqual({ product: 'hat' })
    intentsStore.getState().setTabParams('ws-1', 'view:shop', { tab: 'reviews' })
    expect(getTabParams('ws-1', 'view:shop')).toEqual({ tab: 'reviews' })
  })

  test('focusTab stores params and opens the tab through the bound screen', () => {
    const opened: WorkspaceTabId[] = []
    const unbind = bindWorkspaceIntents('ws-f', {
      openTab: tab => opened.push(tab),
      sendAction: () => {}
    })
    focusTab('ws-f', 'view:shop', { product: 'scarf' })
    expect(opened).toEqual(['view:shop'])
    expect(getTabParams('ws-f', 'view:shop')).toEqual({ product: 'scarf' })
    // A bare focus keeps the tab's existing params.
    focusTab('ws-f', 'view:shop')
    expect(opened).toEqual(['view:shop', 'view:shop'])
    expect(getTabParams('ws-f', 'view:shop')).toEqual({ product: 'scarf' })
    unbind()
  })

  test('focusTab with no bound screen still records params, never throws', () => {
    focusTab('ws-unbound', 'view:crm', { account: 'acme' })
    expect(getTabParams('ws-unbound', 'view:crm')).toEqual({ account: 'acme' })
  })

  test('unbinding stops dispatch to the old screen; a rebind wins', () => {
    const first: string[] = []
    const second: string[] = []
    const unbindFirst = bindWorkspaceIntents('ws-r', {
      openTab: tab => first.push(tab),
      sendAction: label => first.push(`action:${label}`)
    })
    const unbindSecond = bindWorkspaceIntents('ws-r', {
      openTab: tab => second.push(tab),
      sendAction: label => second.push(`action:${label}`)
    })
    // The stale first cleanup must not remove the second binding.
    unbindFirst()
    focusTab('ws-r', 'widgets')
    expect(first).toEqual([])
    expect(second).toEqual(['widgets'])
    unbindSecond()
    focusTab('ws-r', 'widgets')
    expect(second).toEqual(['widgets'])
  })
})
