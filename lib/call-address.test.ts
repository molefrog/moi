import { expect, test } from 'bun:test'

import { normalizeFunctionAddress, parseToolAddress } from './call-address'
import { parseFunctionPath } from '../server/functions'

test('canonical and legacy server addresses resolve to identical modules', () => {
  for (const [canonical, legacy] of [
    ['view:orders/listOrders', 'views/orders/listOrders'],
    ['widget:hello/getGreeting', 'widgets/hello/getGreeting'],
    ['shared/db/read', 'shared/db/read']
  ])
    expect(parseFunctionPath(normalizeFunctionAddress(canonical))).toEqual(
      parseFunctionPath(legacy)
    )
})

test('tool addresses require a view and a single named operation', () => {
  expect(parseToolAddress('view:orders/set_filter')).toEqual({
    viewId: 'orders',
    name: 'set_filter'
  })
  for (const address of [
    'views/orders/set_filter',
    'widget:orders/x',
    'view:../x',
    'view:orders/x/y',
    'view:orders/'
  ]) {
    expect(parseToolAddress(address)).toBeNull()
  }
})
