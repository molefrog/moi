import { expect, test } from 'bun:test'

import { normalizeFunctionAddress, parseCallAddress } from './call-address'
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

test('call addresses discover a view or invoke one named operation', () => {
  expect(parseCallAddress('view:orders')).toEqual({ viewId: 'orders' })
  expect(parseCallAddress('view:orders/set_filter')).toEqual({
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
    expect(parseCallAddress(address)).toBeNull()
  }
})
