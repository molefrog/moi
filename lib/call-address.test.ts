import { expect, test } from 'bun:test'

import { parseCallAddress } from './call-address'
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
