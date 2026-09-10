import { expect, test } from 'bun:test'

import { parseToolTarget } from './tool-target'

test('tool targets identify one view without carrying an operation', () => {
  expect(parseToolTarget('view:orders')).toEqual({ viewId: 'orders' })
  for (const target of [
    'views:orders',
    'widget:orders',
    'view:../x',
    'view:orders/set_filter',
    'view:'
  ]) {
    expect(parseToolTarget(target)).toBeNull()
  }
})
