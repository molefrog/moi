import { afterEach, expect, test } from 'bun:test'

import type { CollabIdentity } from '@/lib/collab/types'

import type * as Identity from './identity'
import type { CollabIdentityApi } from './identity'

const PROFILE_KEY = 'moi:collab:dev-profile'
const alice = { id: 'alice', name: 'Alice', color: '#0f766e' }
const bob = { id: 'bob', name: 'Bob', color: '#2563eb' }
const descriptors = new Map(
  ['window', 'location', 'navigator', 'sessionStorage'].map(key => [
    key,
    Object.getOwnPropertyDescriptor(globalThis, key)
  ])
)
let instance = 0

afterEach(() => {
  for (const [key, descriptor] of descriptors) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor)
    else Reflect.deleteProperty(globalThis, key)
  }
})

async function setup(getIdentity?: () => CollabIdentity | null, profile?: CollabIdentity) {
  const host: { moi?: { collab?: Partial<CollabIdentityApi> } } = getIdentity
    ? { moi: { collab: { getIdentity } } }
    : {}
  const saved = new Map<string, string>([
    ['moi:collab:dev-identity', JSON.stringify(alice)],
    ...(profile ? [[PROFILE_KEY, JSON.stringify(profile)] as [string, string]] : [])
  ])
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => saved.set(key, value)
    }
  })
  Object.defineProperty(globalThis, 'window', { configurable: true, value: host })
  // Each bridge starts fresh without changing the singleton used by client.test.ts.
  const path = `./identity.ts?identity-test=${++instance}`
  const identity: typeof Identity = await import(path)
  identity.installIdentityApi()
  return { ...identity, host, saved }
}

test('identity starts empty and persists only an explicitly enabled dev profile', async () => {
  const identity = await setup()
  expect(identity.getIdentity()).toBeNull()
  expect(identity.getIdentitySource()).toBeNull()
  expect(identity.saved.has(PROFILE_KEY)).toBe(false)
  identity.setDevIdentity(alice)
  expect(identity.getIdentity()).toEqual(alice)
  expect(identity.getIdentitySource()).toBe('dev')
  expect(JSON.parse(identity.saved.get(PROFILE_KEY) ?? 'null')).toEqual(alice)
})

test('an explicitly saved dev profile restores when no external provider is configured', async () => {
  const identity = await setup(undefined, alice)
  expect(identity.getIdentity()).toEqual(alice)
  expect(identity.getIdentitySource()).toBe('dev')
})

test('external takeover and sign-out prevent late dev writes', async () => {
  const identity = await setup()
  identity.setDevIdentity(alice)
  const notifications: Array<CollabIdentity | null> = []
  const unsubscribe = identity.subscribeIdentity(value => notifications.push(value))
  identity.setIdentity(bob)
  identity.setDevIdentity({ ...alice, name: 'Late edit' })
  expect(identity.getIdentity()).toEqual(bob)
  expect(identity.getIdentitySource()).toBe('external')
  identity.setIdentity(null)
  identity.setDevIdentity(alice)
  expect(identity.getIdentity()).toBeNull()
  expect(identity.getIdentitySource()).toBe('external')
  expect(notifications).toEqual([alice, bob, null])
  expect(JSON.parse(identity.saved.get(PROFILE_KEY) ?? 'null')).toEqual(alice)
  unsubscribe()
  identity.setIdentity(bob)
  expect(notifications).toHaveLength(3)
})

test('external sign-out claims identity even before a user is available', async () => {
  const identity = await setup()
  const sources: Array<ReturnType<typeof identity.getIdentitySource>> = []
  const unsubscribe = identity.subscribeIdentityStore(() =>
    sources.push(identity.getIdentitySource())
  )
  identity.setIdentity(null)
  identity.setDevIdentity(alice)
  expect(identity.getIdentity()).toBeNull()
  expect(identity.getIdentitySource()).toBe('external')
  expect(sources).toEqual(['external'])
  expect(identity.saved.has(PROFILE_KEY)).toBe(false)
  unsubscribe()
})

test.each([
  ['signed in', (): CollabIdentity | null => bob, bob],
  ['signed out', (): CollabIdentity | null => null, null],
  [
    'unavailable',
    (): CollabIdentity | null => {
      throw new Error('Provider unavailable')
    },
    null
  ]
] as const)('an injected provider remains in charge while %s', async (_state, getter, expected) => {
  const identity = await setup(getter, alice)
  expect(identity.getIdentity()).toEqual(expected)
  expect(identity.getIdentitySource()).toBe('external')
  identity.setDevIdentity(alice)
  expect(identity.getIdentity()).toEqual(expected)
  expect(JSON.parse(identity.saved.get(PROFILE_KEY) ?? 'null')).toEqual(alice)
  identity.host.moi?.collab?.setIdentity?.(bob)
  expect(identity.getIdentity()).toEqual(bob)
})

test('invalid identities leave the current identity and source intact', async () => {
  const identity = await setup()
  const invalid = { ...alice, name: ' ' }
  expect(() => identity.setDevIdentity(invalid)).toThrow('id and name')
  expect(identity.getIdentitySource()).toBeNull()
  expect(identity.getIdentity()).toBeNull()
  identity.setDevIdentity(alice)
  expect(() => identity.setIdentity(invalid)).toThrow('id and name')
  expect(identity.getIdentitySource()).toBe('dev')
  expect(identity.getIdentity()).toEqual(alice)
  expect(JSON.parse(identity.saved.get(PROFILE_KEY) ?? 'null')).toEqual(alice)
})

test('the outer share bridge uses its URL and rejects unsafe destinations', async () => {
  const identity = await setup()
  const copied: string[] = []
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
  const api = identity.host.moi?.collab
  if (!api?.setShareHandler) throw new Error('The collab identity bridge was not installed')
  api.setShareHandler(async context => {
    expect(context.workspaceId).toBe('board')
    return { url: 'https://cloud.example/share/board' }
  })
  expect(await identity.shareWorkspace('board')).toBe('copied')
  expect(copied).toEqual(['https://cloud.example/share/board'])
  api.setShareHandler(null)
  await identity.shareWorkspace('board')
  expect(copied.at(-1)).toBe('https://moi.example/workspace/board')
  api.setShareHandler(async () => ({ url: 'javascript:alert(1)' }))
  await expect(identity.shareWorkspace('board')).rejects.toThrow('invalid URL')
  expect(copied).toHaveLength(2)
})
