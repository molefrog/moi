import { expect, test } from 'bun:test'
import type { CodexClient } from './client'
import { expandCodexApps } from './connectors'

test('lists accessible catalog apps and explicit custom servers, excluding internal runtime tools', async () => {
  const calls: Array<{ method: string; params: unknown }> = []
  const rpc: CodexClient['rpc'] = async <T>(method: string, params?: unknown): Promise<T> => {
    calls.push({ method, params })
    const responses: Record<string, unknown> = {
      'config/read': {
        layers: [
          { name: { type: 'user' }, config: { mcp_servers: { custom: {} } } },
          { name: { type: 'packagedDefaults' }, config: { mcp_servers: { internal: {} } } },
          {
            name: { type: 'project' },
            disabledReason: 'untrusted',
            config: { mcp_servers: { ignored: {} } }
          }
        ]
      },
      'app/list': (params as { cursor?: string }).cursor
        ? {
            data: [
              {
                id: 'mail',
                name: 'Mail',
                logoUrl: '/images/ecosystem/apps/gmail/icon.png',
                isAccessible: true,
                isEnabled: false
              }
            ],
            nextCursor: null
          }
        : {
            data: [
              {
                id: 'drive',
                name: 'Google Drive',
                logoUrl: 'https://example.com/drive.png',
                isAccessible: true,
                isEnabled: true
              },
              { id: 'unlinked', name: 'Unlinked', isAccessible: false, isEnabled: true }
            ],
            nextCursor: 'next'
          },
      'app/installed': {
        apps: [
          { id: 'drive', enabled: true, callable: true },
          { id: 'internal-app', enabled: true, callable: true }
        ]
      }
    }
    return responses[method] as T
  }
  const result = await expandCodexApps(
    { rpc },
    [
      { name: 'codex_apps', status: 'connected' },
      { name: 'custom', status: 'failed' },
      { name: 'internal', status: 'connected' },
      { name: 'injected', status: 'connected' },
      { name: 'ignored', status: 'connected' }
    ],
    'thread-1',
    '/workspace'
  )
  expect(result).toEqual([
    { name: 'custom', status: 'failed' },
    {
      name: 'codex_apps/drive',
      displayName: 'Google Drive',
      iconUrl: 'https://example.com/drive.png',
      status: 'connected'
    },
    {
      name: 'codex_apps/mail',
      displayName: 'Mail',
      iconUrl: 'https://chatgpt.com/images/ecosystem/apps/gmail/icon.png',
      status: 'disabled'
    }
  ])
  expect(calls.filter(call => call.method === 'app/list').map(call => call.params)).toEqual([
    { threadId: 'thread-1', limit: 100 },
    { threadId: 'thread-1', limit: 100, cursor: 'next' }
  ])
})

test('propagates discovery failures instead of displaying internal servers as a fallback', async () => {
  const rpc: CodexClient['rpc'] = async () => {
    throw new Error('offline')
  }
  await expect(
    expandCodexApps({ rpc }, [{ name: 'codex_apps', status: 'connected' }])
  ).rejects.toThrow('offline')
})

test('publishes app notifications before the final response and removes the listener', async () => {
  let listener: Parameters<CodexClient['onNotification']>[0] | undefined
  let removed = false
  const pending = Promise.withResolvers<{ data: unknown[]; nextCursor: null }>()
  const started = Promise.withResolvers<void>()
  const app = { id: 'drive', name: 'Drive', isAccessible: true, isEnabled: true, logoUrl: null }
  const rpc: CodexClient['rpc'] = async <T>(
    method: string,
    _params?: unknown,
    options?: { timeoutMs?: number }
  ): Promise<T> => {
    if (method === 'config/read') return { layers: [] } as T
    if (method === 'app/installed')
      return { apps: [{ id: 'drive', enabled: true, callable: true }] } as T
    expect(options?.timeoutMs).toBe(60_000)
    started.resolve()
    return (await pending.promise) as T
  }
  const updates: string[][] = []
  const result = expandCodexApps(
    {
      rpc,
      onNotification(fn) {
        listener = fn
        return () => {
          removed = true
        }
      }
    },
    [{ name: 'codex_apps', status: 'connected' }],
    undefined,
    undefined,
    rows => updates.push(rows.map(row => row.name))
  )
  await started.promise
  listener?.('app/list/updated', { data: [app] })
  expect(updates.at(-1)).toEqual(['codex_apps/drive'])
  pending.resolve({ data: [app], nextCursor: null })
  await result
  expect(removed).toBe(true)
})
