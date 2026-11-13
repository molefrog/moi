import { beforeEach, afterEach, expect, spyOn, test } from 'bun:test'
import * as client from '../remote/client'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { requestWorkspace } from './api'
import { DEFAULT_REGISTRY_PATH, registerWorkspace, setRegistryPath } from './registry'

let target: { path: string; remote: { user_id: string; workspace_id: string } }
beforeEach(async () => {
  const path = await mkdtemp(join(tmpdir(), 'moi-api-'))
  target = { path, remote: { user_id: 'alice', workspace_id: 'board' } }
  await mkdir(join(path, '.moi'))
  await Bun.write(
    join(path, '.moi/.workspace.json'),
    JSON.stringify({ version: 2, remote: { user_id: 'alice', workspace_id: 'board' } })
  )
  setRegistryPath(join(path, 'registry.json'))
  await registerWorkspace(path, { id: 'visitor-id' })
})
const spies: { mockRestore(): void }[] = []
afterEach(async () => {
  setRegistryPath(DEFAULT_REGISTRY_PATH)
  await rm(target.path, { recursive: true, force: true })
  for (const spy of spies.splice(0)) spy.mockRestore()
})
function mockOwner(handler: (url: string, init?: RequestInit) => Response) {
  spies.push(
    spyOn(client, 'workspaceRequest').mockImplementation(
      async (userId, workspaceId, path, options) => {
        const response = handler(
          `http://localhost:8787/api/workspaces/${userId}:${workspaceId}${path}`,
          {
            method: options?.method,
            body: options?.body,
            redirect: 'error'
          }
        )
        if (!response.ok) throw new Error(`Remote operation failed (${response.status})`)
        return response
      }
    )
  )
}

test('remote workspace requests reach the owner through the configured gateway', async () => {
  const requests: { url: string; method?: string; body?: string }[] = []
  mockOwner((url, init) => {
    requests.push({
      url,
      method: init?.method,
      body: new TextDecoder().decode(init?.body as ArrayBuffer)
    })
    expect(init?.redirect).toBe('error')
    return new Response('result')
  })
  const response = await requestWorkspace(target, '/rpc/views/counter/increment', {
    method: 'POST',
    body: 'payload'
  })
  expect(await response.text()).toBe('result')
  expect(requests).toEqual([
    {
      url: 'http://localhost:8787/api/workspaces/alice:board/rpc/views/counter/increment',
      method: 'POST',
      body: 'payload'
    }
  ])
})

test('owner request failures include the status and response message', async () => {
  mockOwner(() => new Response('Unavailable', { status: 503 }))
  await expect(requestWorkspace(target, '/config')).rejects.toThrow('Remote operation failed (503)')
})
