import { expect, test } from 'bun:test'

import type { CollabIdentity } from '@/lib/collab/types'

import {
  getIdentity,
  getIdentitySource,
  installIdentityApi,
  setDevIdentity,
  shareWorkspace
} from './identity'
import type { CollabIdentityApi } from './identity'

test('runtime identity starts empty until explicit setup and supports the outer identity/share bridge', async () => {
  const descriptors = new Map(
    ['window', 'location', 'navigator', 'sessionStorage'].map(key => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key)
    ])
  )
  const host: { moi?: { collab?: CollabIdentityApi } } = {}
  const copied: string[] = []
  const saved = new Map<string, string>([
    [
      'moi:collab:dev-identity',
      JSON.stringify({ id: 'old-auto', name: 'Automatic', color: '#0f766e' })
    ]
  ])
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => saved.set(key, value)
    }
  })
  Object.defineProperty(globalThis, 'window', { configurable: true, value: host })
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: { origin: 'https://moi.example' }
  })
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      clipboard: {
        writeText: async (text: string) => {
          copied.push(text)
        }
      }
    }
  })
  try {
    installIdentityApi()
    expect(getIdentity()).toBeNull()
    expect(getIdentitySource()).toBeNull()
    expect(saved.has('moi:collab:dev-profile')).toBe(false)
    const api = host.moi?.collab
    if (!api) throw new Error('The collab identity bridge was not installed')
    const notifications: Array<CollabIdentity | null> = []
    const unsubscribe = api.subscribeIdentity(identity => notifications.push(identity))
    expect(notifications).toEqual([null])
    const alice = { id: 'alice', name: 'Alice', color: '#0f766e' }
    api.setIdentity(alice)
    expect(api.getIdentity()).toEqual(alice)
    expect(notifications.at(-1)).toEqual(alice)
    api.setIdentity(null)
    expect(api.getIdentity()).toBeNull()
    expect(notifications).toHaveLength(3)
    unsubscribe()
    api.setIdentity(alice)
    expect(notifications).toHaveLength(3)
    api.setShareHandler(async context => {
      expect(context.workspaceId).toBe('board')
      return { url: 'https://cloud.example/share/board' }
    })
    expect(await shareWorkspace('board')).toBe('copied')
    expect(copied).toEqual(['https://cloud.example/share/board'])
    api.setShareHandler(null)
    await shareWorkspace('board')
    expect(copied.at(-1)).toBe('https://moi.example/workspace/board')
    api.setShareHandler(async () => ({ url: 'javascript:alert(1)' }))
    await expect(shareWorkspace('board')).rejects.toThrow('invalid URL')
    expect(copied).toHaveLength(2)
    api.setShareHandler(null)
    setDevIdentity(alice)
    expect(getIdentitySource()).toBe('dev')
    expect(JSON.parse(saved.get('moi:collab:dev-profile') ?? 'null')).toEqual(alice)
    api.setIdentity(null)
  } finally {
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  }
})
