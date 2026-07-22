import { describe, expect, test } from 'bun:test'

import { appletFromSource, intentStore, routeIntentDispatch } from './intents'
import type { ViewInfo, WorkspaceTabId } from '@/lib/types'

const views: ViewInfo[] = [
  { id: 'crm', config: { title: 'CRM', intents: [{ name: 'open-customer' }] } },
  { id: 'orders', config: { title: 'Orders', intents: [{ name: 'open-order' }] } }
]

describe('routeIntentDispatch', () => {
  test('routes to the declaring view: delivers the payload and opens its tab', () => {
    const opened: WorkspaceTabId[] = []
    const resolved = routeIntentDispatch(
      { workspaceId: 'ws-1', views, openTab: tab => opened.push(tab) },
      { name: 'open-order', params: { id: 'o-7' }, source: 'widget:products' }
    )
    expect(resolved).toBe(true)
    expect(opened).toEqual(['view:orders'])
    expect(intentStore.getState().delivered['ws-1:orders']).toEqual({
      intent: 'open-order',
      params: { id: 'o-7' }
    })
  })

  test('params default to an empty object', () => {
    routeIntentDispatch(
      { workspaceId: 'ws-1', views, openTab: () => {} },
      { name: 'open-customer', source: 'cli' }
    )
    expect(intentStore.getState().delivered['ws-1:crm']).toEqual({
      intent: 'open-customer',
      params: {}
    })
  })

  test('a later dispatch to the same view replaces the delivered intent', () => {
    const ctx = { workspaceId: 'ws-2', views, openTab: () => {} }
    routeIntentDispatch(ctx, { name: 'open-order', params: { id: 'a' }, source: 'cli' })
    routeIntentDispatch(ctx, { name: 'open-order', params: { id: 'b' }, source: 'cli' })
    expect(intentStore.getState().delivered['ws-2:orders']).toEqual({
      intent: 'open-order',
      params: { id: 'b' }
    })
  })

  test('an unresolved dispatch delivers nothing and switches no tab', () => {
    const opened: WorkspaceTabId[] = []
    const before = intentStore.getState().delivered
    const resolved = routeIntentDispatch(
      { workspaceId: 'ws-3', views, openTab: tab => opened.push(tab) },
      { name: 'close-ticket', source: 'widget:products' }
    )
    // The journal report is fire-and-forget (POST /applet-log); observable
    // behavior here is: no resolution, no tab switch, no delivery.
    expect(resolved).toBe(false)
    expect(opened).toEqual([])
    expect(intentStore.getState().delivered).toEqual(before)
  })
})

describe('appletFromSource', () => {
  test('parses applet sources for journal attribution', () => {
    expect(appletFromSource('widget:products')).toEqual({ kind: 'widget', name: 'products' })
    expect(appletFromSource('view:crm')).toEqual({ kind: 'view', name: 'crm' })
  })

  test('non-applet sources attribute to nothing', () => {
    expect(appletFromSource('cli')).toBeNull()
    expect(appletFromSource('applet')).toBeNull()
    expect(appletFromSource('widget:')).toBeNull()
    expect(appletFromSource('widget:bad name')).toBeNull()
  })
})
