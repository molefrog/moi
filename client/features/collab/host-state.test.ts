import * as identityStore from '../identity/store'
import { colorForId } from '@/lib/collab/colors'
import { afterEach, expect, spyOn, test } from 'bun:test'

import type { UserProfile } from '@/lib/collab/types'

import type * as HostStateModule from './host-state'

const PROFILE_KEY = 'moi:local-profile'
const alice = { id: 'alice', name: 'Alice', color: 'emerald' } satisfies UserProfile
const bob = { id: 'bob', name: 'Bob', color: 'blue' } satisfies UserProfile
const carol = { id: 'cf-carol', color: 'emerald', email: 'carol@example.com' } as const
const accessed = { provider: 'cloudflare-access', profile: carol } as const
const descriptors = new Map(
  ['window', 'localStorage'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)])
)
let instance = 0
let restoreIdentity = () => {}

afterEach(() => {
  restoreIdentity()
  identityStore.setIdentity(null)
  for (const [key, descriptor] of descriptors) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor)
    else Reflect.deleteProperty(globalThis, key)
  }
})

type Host = { moi?: Record<string, unknown> }
type SetupOptions = {
  // A local profile saved by an earlier session.
  profile?: UserProfile
  beforeInstall?: (state: typeof HostStateModule) => void
  initializeSaved?: boolean
  host?: Host
}

async function setup({
  profile,
  beforeInstall,
  initializeSaved = true,
  host = {}
}: SetupOptions = {}) {
  restoreIdentity()
  const identitySpy = spyOn(identityStore, 'getIdentity').mockReturnValue(undefined)
  restoreIdentity = () => identitySpy.mockRestore()
  const saved = new Map<string, string>(profile ? [[PROFILE_KEY, JSON.stringify(profile)]] : [])
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => saved.set(key, value)
    }
  })
  Object.defineProperty(globalThis, 'window', { configurable: true, value: host })
  // Each bridge starts fresh without changing the singleton used by client.test.ts.
  const path = `./host-state.ts?host-state-test=${++instance}`
  const collab: typeof HostStateModule = await import(path)
  beforeInstall?.(collab)
  if (profile && initializeSaved) collab.initializeLocalUser(true, {})
  return {
    ...collab,
    saved,
    publishIdentity: (profile: UserProfile | undefined) => {
      restoreIdentity()
      identityStore.setIdentity(
        profile
          ? {
              id: profile.id,
              type: 'user',
              name: profile.name ?? '',
              email: profile.email ?? '',
              avatar: profile.avatar,
              isAnonymous: false
            }
          : null
      )
    }
  }
}

test('a saved local profile restores after confirmed local initialization', async () => {
  const savedProfile = { ...alice, id: 'local-saved' }
  const collab = await setup({ profile: savedProfile })
  expect(collab.getCurrentUser()).toEqual(savedProfile)
  expect(collab.getCurrentUserSource()).toBe('local')
  expect(JSON.parse(collab.saved.get(PROFILE_KEY)!)).toEqual(savedProfile)
})

test('saved local users stay inactive until local mode is confirmed and the proxy check succeeds', async () => {
  const collab = await setup({ profile: alice, initializeSaved: false })
  expect(collab.getCurrentUser()).toBeUndefined()
  collab.initializeLocalUser(false, {})
  collab.initializeLocalUser(true, undefined)
  expect(collab.getCurrentUser()).toBeUndefined()
  expect(JSON.parse(collab.saved.get(PROFILE_KEY)!)).toEqual(alice)
  collab.initializeLocalUser(true, {})
  expect(collab.getCurrentUser()).toEqual(alice)
  expect(collab.getCurrentUserSource()).toBe('local')
})

test.each([accessed, { provider: 'cloudflare-access' } as const])(
  'proxy identity and sign-out prevent local restoration or creation: %j',
  async proxyUser => {
    const collab = await setup({ profile: alice, initializeSaved: false })
    collab.setProxyUserState(proxyUser)
    collab.initializeLocalUser(true, proxyUser)
    collab.initializeLocalUser(true, {})
    expect(collab.getCurrentUser()).toEqual('profile' in proxyUser ? carol : undefined)
    expect(collab.getCurrentUserSource()).toBe('cloudflare-access')
    expect(JSON.parse(collab.saved.get(PROFILE_KEY)!)).toEqual(alice)
  }
)

test('invalid or unavailable local storage still allows a confirmed local user', async () => {
  const collab = await setup()
  collab.saved.set(PROFILE_KEY, 'invalid json')
  collab.initializeLocalUser(true, {})
  expect(JSON.parse(collab.saved.get(PROFILE_KEY)!)).toEqual(collab.getCurrentUser())
  const inaccessible = await setup()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: () => {
        throw new Error('Storage unavailable')
      },
      setItem: () => {
        throw new Error('Storage unavailable')
      }
    }
  })
  inaccessible.initializeLocalUser(true, {})
  expect(inaccessible.getCurrentUserSource()).toBe('local')
  expect(inaccessible.getCurrentUser()).toBeDefined()
})

// The host script runs after moi's bundle but before startup finishes, so its
// first publish lands ahead of local initialization.
test('storage changes synchronize local profiles without writing back or replacing external users', async () => {
  const collab = await setup({ profile: alice })
  let notices = 0
  collab.subscribeCurrentUserStore(() => notices++)
  collab.receiveLocalProfile({ key: PROFILE_KEY, newValue: JSON.stringify(bob) })
  expect(collab.getCurrentUser()).toEqual(bob)
  expect(JSON.parse(collab.saved.get(PROFILE_KEY)!)).toEqual(alice)
  expect(notices).toBe(1)
  collab.receiveLocalProfile({ key: PROFILE_KEY, newValue: 'bad' })
  collab.receiveLocalProfile({ key: PROFILE_KEY, newValue: JSON.stringify(bob) })
  expect(notices).toBe(1)
  collab.publishIdentity(alice)
  collab.receiveLocalProfile({ key: PROFILE_KEY, newValue: JSON.stringify(bob) })
  expect(collab.getCurrentUser()).toEqual({ ...alice, color: colorForId(alice.id) })
})

test('storage subscription updates the profile and stops after cleanup', async () => {
  const events = new EventTarget()
  const host = {
    moi: {},
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events)
  }
  const collab = await setup({ profile: alice, host })
  const unsubscribe = collab.subscribeLocalProfileStorage()
  const notify = (profile: UserProfile) => {
    const event = new Event('storage')
    Object.assign(event, { key: PROFILE_KEY, newValue: JSON.stringify(profile) })
    events.dispatchEvent(event)
  }
  notify(bob)
  expect(collab.getCurrentUser()).toEqual(bob)
  unsubscribe()
  notify(alice)
  expect(collab.getCurrentUser()).toEqual(bob)
})

test('cloud identity publishes without a global member list or callback', async () => {
  const collab = await setup({ profile: alice })
  let notices = 0
  collab.subscribeCurrentUserStore(() => notices++)
  collab.publishIdentity(bob)
  expect(collab.getCurrentUser()).toEqual({ ...bob, color: colorForId(bob.id) })
  expect(collab.getCurrentUserSource()).toBe('external')
  const profile = collab.getCurrentUser()
  expect(collab.getCurrentUser()).toBe(profile)
  collab.publishIdentity({ ...bob })
  expect(collab.getCurrentUser()).toBe(profile)
  expect(notices).toBe(1)
  collab.setProxyUserState(accessed)
  expect(collab.getCurrentUser()).toEqual({ ...bob, color: colorForId(bob.id) })
  collab.publishIdentity(undefined)
  collab.setLocalUser(alice)
  expect(collab.getCurrentUser()).toBeUndefined()
})

test('agent identity and anonymous sign-in derive presence without restoring a local profile', async () => {
  const collab = await setup({ profile: alice })
  restoreIdentity()
  identityStore.setIdentity({ id: 'helper', type: 'agent', name: 'Helper' })
  expect(collab.getCurrentUser()).toMatchObject({ id: 'agent:helper', name: 'Helper' })
  identityStore.setIdentity({ id: 'guest', type: 'user', name: '', email: '', isAnonymous: true })
  expect(collab.getCurrentUser()).toBeUndefined()
  expect(collab.getCurrentUserSource()).toBe('external')
  collab.initializeLocalUser(true, {})
  expect(collab.getCurrentUser()).toBeUndefined()
})
