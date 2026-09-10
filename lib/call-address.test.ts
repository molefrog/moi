import { expect, test } from 'bun:test'

import { parseCallAddress } from './call-address'
test('call addresses discover a view or invoke one named operation', () => {
  expect(parseCallAddress('view:orders')).toEqual({ viewId: 'orders' })
  expect(parseCallAddress('view:orders/set_filter')).toEqual({
    viewId: 'orders',
    name: 'set_filter'
  })
  expect(parseCallAddress('view:orders/order.archive')).toEqual({
    viewId: 'orders',
    name: 'order.archive'
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
