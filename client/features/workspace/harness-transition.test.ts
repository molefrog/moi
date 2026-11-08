import { afterEach, beforeEach, expect, test } from 'bun:test'
import { QueryClient } from '@tanstack/react-query'
import { workspaceKeys } from '@/client/api/workspace-keys'
import { createDefaultWorkspaceLayout } from '@/lib/workspace-layout'
import type { McpServer, WorkspaceState } from '@/lib/types'
import { receiveWorkspaceHarness } from './harness-transition'

const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')
let client: QueryClient
beforeEach(() => {
  const storage = new Map<string, string>()
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value)
      }
    }
  })
  client = new QueryClient()
  client.setQueryData(workspaceKeys.layout('one'), {
    ...createDefaultWorkspaceLayout(),
    provider: 'claude-code'
  })
  client.setQueryData(workspaceKeys.state('one'), {
    revision: 1,
    selected: { overview: 'old' },
    pinnedSessionId: 'old',
    sessions: {},
    pendingViews: {}
  })
})
afterEach(() => {
  client.clear()
  if (storageDescriptor) Object.defineProperty(globalThis, 'sessionStorage', storageDescriptor)
  else Reflect.deleteProperty(globalThis, 'sessionStorage')
})

test('refreshes only harness-dependent queries and preserves a selection after a duplicate event', async () => {
  client.setQueryData(workspaceKeys.events('one', 'old'), ['transcript'])
  client.setQueryData(workspaceKeys.harness('one'), { provider: 'claude-code' })
  client.setQueryData(workspaceKeys.widgets('one'), ['widget'])
  client.setQueryData(workspaceKeys.harness('two'), { provider: 'codex' })
  await receiveWorkspaceHarness(client, 'one', 'codex')
  expect(client.getQueryData(workspaceKeys.harness('one'))).toBeUndefined()
  expect(client.getQueryState(workspaceKeys.harness('two'))?.isInvalidated).toBe(false)
  expect(client.getQueryState(workspaceKeys.widgets('one'))?.isInvalidated).toBe(false)
  expect(client.getQueryData(workspaceKeys.events('one', 'old'))).toBeUndefined()
  expect(client.getQueryData<WorkspaceState>(workspaceKeys.state('one'))?.selected).toEqual({})
  client.setQueryData<WorkspaceState>(workspaceKeys.state('one'), state => ({
    ...state!,
    selected: { overview: 'new' }
  }))
  await receiveWorkspaceHarness(client, 'one', 'codex')
  expect(client.getQueryData<WorkspaceState>(workspaceKeys.state('one'))?.selected).toEqual({
    overview: 'new'
  })
})

test('detects a missed event after the layout has already refreshed on reconnect', async () => {
  await receiveWorkspaceHarness(client, 'one', 'claude-code')
  client.setQueryData(workspaceKeys.layout('one'), {
    ...createDefaultWorkspaceLayout(),
    provider: 'codex'
  })
  await receiveWorkspaceHarness(client, 'one', 'codex')
  expect(client.getQueryData<WorkspaceState>(workspaceKeys.state('one'))?.selected).toEqual({})
})

test('an implicit Claude layout switches and clears its old transcript and selection', async () => {
  client.setQueryData(workspaceKeys.layout('one'), createDefaultWorkspaceLayout())
  client.setQueryData(workspaceKeys.events('one', 'old'), ['transcript'])
  client.setQueryData(workspaceKeys.harness('one'), { provider: 'claude-code' })
  await receiveWorkspaceHarness(client, 'one', 'codex')
  expect(client.getQueryData(workspaceKeys.layout('one'))).toMatchObject({ provider: 'codex' })
  expect(client.getQueryData(workspaceKeys.harness('one'))).toBeUndefined()
  expect(client.getQueryData(workspaceKeys.events('one', 'old'))).toBeUndefined()
  expect(client.getQueryData<WorkspaceState>(workspaceKeys.state('one'))?.selected).toEqual({})
})

test('an absent layout is not treated as an implicit Claude workspace', async () => {
  client.removeQueries({ queryKey: workspaceKeys.layout('one') })
  await receiveWorkspaceHarness(client, 'one', 'codex')
  expect(client.getQueryData(workspaceKeys.layout('one'))).toBeUndefined()
  expect(client.getQueryData<WorkspaceState>(workspaceKeys.state('one'))?.selected).toEqual({
    overview: 'old'
  })
})

test('discards the previous agent connector list even while its settings tab is closed', async () => {
  client.setQueryData(workspaceKeys.layout('one'), {
    ...createDefaultWorkspaceLayout(),
    provider: 'codex'
  })
  client.setQueryData(workspaceKeys.mcp('one'), [{ name: 'codex_apps', status: 'connected' }])
  client.setQueryData(workspaceKeys.mcp('two'), [{ name: 'other', status: 'connected' }])
  await receiveWorkspaceHarness(client, 'one', 'claude-code')
  expect(client.getQueryData(workspaceKeys.mcp('one'))).toBeUndefined()
  expect(client.getQueryData<McpServer[]>(workspaceKeys.mcp('two'))).toEqual([
    { name: 'other', status: 'connected' }
  ])
})
