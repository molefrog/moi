import { expect, spyOn, test } from 'bun:test'
import { QueryClient } from '@tanstack/react-query'

import type { SessionInfo } from '@/lib/types'
import { workspaceSessionsOptions } from './api'

test('a failed session refresh preserves the previously loaded chats', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const options = workspaceSessionsOptions('workspace-1')
  const sessions: SessionInfo[] = [
    { sessionId: 'existing-chat', summary: 'Existing chat', lastModified: 1 }
  ]
  const request = spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(sessions))
  try {
    await client.fetchQuery(options)
    request.mockResolvedValue(new Response('Codex unavailable', { status: 500 }))
    await expect(client.fetchQuery(options)).rejects.toThrow('Codex unavailable')
    expect(client.getQueryData<SessionInfo[]>(options.queryKey)).toEqual(sessions)
    expect(client.getQueryState(options.queryKey)?.status).toBe('error')
  } finally {
    request.mockRestore()
    client.clear()
  }
})
