import { expect, test } from 'bun:test'

import type { McpServer } from '@/lib/types'

import { sortMcpServers } from './McpServerCards'

test('sorts connected connectors first without mutating provider order', () => {
  const servers: McpServer[] = [
    { name: 'failed-first', status: 'failed' },
    { name: 'connected-first', status: 'connected' },
    { name: 'needs-auth', status: 'needs-auth' },
    { name: 'connected-second', status: 'connected' }
  ]

  expect(sortMcpServers(servers).map(server => server.name)).toEqual([
    'connected-first',
    'connected-second',
    'failed-first',
    'needs-auth'
  ])
  expect(servers.map(server => server.name)).toEqual([
    'failed-first',
    'connected-first',
    'needs-auth',
    'connected-second'
  ])
})
