import { expect, spyOn, test } from 'bun:test'
import { resolve } from 'node:path'

import { discoverOpenClawWorkspacePaths } from './discovery'
import * as gateway from './gateway'

test('workspace discovery requests only agent paths and caps the result', async () => {
  const methods: string[] = []
  const connect = spyOn(gateway, 'withOneShotGateway').mockImplementation(async fn =>
    fn(async <T>(method: string) => {
      methods.push(method)
      return {
        defaultId: '0',
        agents: Array.from({ length: 200 }, (_, i) => ({
          id: String(i),
          workspace: `/workspaces/${i}`
        }))
      } as T
    })
  )
  try {
    const paths = await discoverOpenClawWorkspacePaths()
    expect(paths).toHaveLength(128)
    expect(paths[0]).toBe(resolve('/workspaces/0'))
    expect(methods).toEqual(['agents.list'])
  } finally {
    connect.mockRestore()
  }
})

test('an unreachable gateway produces no discovered workspaces', async () => {
  const connect = spyOn(gateway, 'withOneShotGateway').mockResolvedValue(null)
  try {
    expect(await discoverOpenClawWorkspacePaths()).toEqual([])
  } finally {
    connect.mockRestore()
  }
})
