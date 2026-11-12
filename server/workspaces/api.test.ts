import { beforeEach, afterEach, expect, spyOn, test } from 'bun:test'
import * as client from '../remote/client'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { api } from '../api'
import { requestWorkspace } from './api'
import { DEFAULT_REGISTRY_PATH, registerWorkspace, setRegistryPath } from './registry'
import { readScratchpadImage, readScratchpadShapes } from '../scratchpad/document'

let target: { id: string; path: string }
beforeEach(async () => {
  const path = await mkdtemp(join(tmpdir(), 'moi-api-'))
  target = { id: 'visitor-id', path }
  await mkdir(join(path, '.moi'))
  await Bun.write(
    join(path, '.moi/.workspace.json'),
    JSON.stringify({ version: 2, remote: { user_id: 'alice', workspace_id: 'board' } })
  )
  setRegistryPath(join(path, 'registry.json'))
  await registerWorkspace(path, { id: target.id })
})
const spies: { mockRestore(): void }[] = []
afterEach(async () => {
  setRegistryPath(DEFAULT_REGISTRY_PATH)
  await rm(target.path, { recursive: true, force: true })
  for (const spy of spies.splice(0)) spy.mockRestore()
})
function mockOwner(handler: (url: string, init?: RequestInit) => Response) {
  spies.push(
    spyOn(client, 'remoteConfig').mockResolvedValue({
      url: 'http://localhost:8787/cloud',
      clientId: 'moi-cli',
      managed: false
    })
  )
  spies.push(
    spyOn(globalThis, 'fetch').mockImplementation(
      Object.assign(
        async (input: RequestInfo | URL, init?: RequestInit) => handler(String(input), init),
        { preconnect: fetch.preconnect }
      )
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

test('remote scratchpad reads use owner snapshots and image bytes without visitor files', async () => {
  const requests: string[] = []
  mockOwner(url => {
    requests.push(url)
    if (url.endsWith('/scratchpad'))
      return Response.json({
        document: {
          store: {
            image: {
              typeName: 'shape',
              id: 'shape:photo',
              type: 'image',
              x: 10,
              y: 20,
              props: { assetId: 'asset:photo', w: 100, h: 50 }
            },
            asset: {
              typeName: 'asset',
              id: 'asset:photo',
              props: {
                src: 'asset:asset-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png'
              }
            }
          }
        }
      })
    return new Response('image-bytes', { headers: { 'content-type': 'image/png' } })
  })
  expect(await readScratchpadShapes(target)).toEqual([
    {
      id: 'photo',
      type: 'image',
      x: 10,
      y: 20,
      w: 100,
      h: 50,
      src: 'asset:asset-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png'
    }
  ])
  expect(await readScratchpadImage(target, 'photo')).toEqual({
    src: `data:image/png;base64,${Buffer.from('image-bytes').toString('base64')}`
  })
  expect(requests).toContain(
    'http://localhost:8787/api/workspaces/alice:board/scratchpad/assets/asset-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png'
  )
})

test('owner request failures include the status and response message', async () => {
  mockOwner(() => new Response('Unavailable', { status: 503 }))
  await expect(requestWorkspace(target, '/config')).rejects.toThrow(
    'Workspace request failed (503): Unavailable'
  )
})

test('local configs use the local API handler and registration id', async () => {
  await Bun.write(join(target.path, '.moi/.workspace.json'), JSON.stringify({ version: 2 }))
  const local = spyOn(api, 'fetch').mockImplementation(async request => {
    expect(new URL(request.url).pathname).toBe('/api/workspaces/visitor-id/config')
    expect(request.method).toBe('PUT')
    expect(await request.json()).toEqual({ name: 'Local name' })
    return Response.json({ name: 'Local name' })
  })
  spies.push(local)
  expect(
    await (
      await requestWorkspace(target, '/config', {
        method: 'PUT',
        body: JSON.stringify({ name: 'Local name' })
      })
    ).json()
  ).toEqual({ name: 'Local name' })
})
