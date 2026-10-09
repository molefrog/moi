import { afterEach, expect, test } from 'bun:test'

import { colorForId } from '@/lib/collab/colors'
import type { UserProfile } from '@/lib/collab/types'

import type * as HostStateModule from './host-state'
import type { HostApi, HostUsers } from './host-state'

const PROFILE_KEY = 'moi:collab:dev-profile'
const alice = { id: 'alice', name: 'Alice', color: 'emerald' } satisfies UserProfile
const bob = { id: 'bob', name: 'Bob', color: 'blue' } satisfies UserProfile
const carol = { id: 'cf-carol', color: 'emerald', email: 'carol@example.com' } as const
const accessed = { provider: 'cloudflare-access', profile: carol } as const
const descriptors = new Map(
  ['window', 'sessionStorage'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)])
)
let instance = 0

afterEach(() => {
  for (const [key, descriptor] of descriptors) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor)
    else Reflect.deleteProperty(globalThis, key)
  }
})

type Host = { moi?: { collab?: HostApi; [key: string]: unknown } }
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
  const saved = new Map<string, string>(profile ? [[PROFILE_KEY, JSON.stringify(profile)]] : [])
  Object.defineProperty(globalThis, 'sessionStorage', {
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
  collab.installHostApi()
  if (profile && initializeSaved) collab.initializeLocalUser(true, {})
  // What a host script sees on `window.moi.collab` once moi's bundle has run.
  const api = host.moi?.collab as HostApi
  return { ...collab, api, saved }
}

test('installation exposes publishUsers alone and leaves local identity pending until initialization', async () => {
  const host: Host = { moi: { kept: 'by the host' } }
  const collab = await setup({ host })
  expect(Object.keys(collab.api)).toEqual(['publishUsers'])
  expect(host.moi?.kept).toBe('by the host')
  expect(collab.getCurrentUser()).toBeUndefined()
  expect(collab.getCurrentUserSource()).toBeUndefined()
  expect(collab.getDirectory()).toBeUndefined()
  expect(collab.saved.has(PROFILE_KEY)).toBe(false)
  collab.setLocalUser(alice)
  expect(collab.getCurrentUser()).toEqual(alice)
  expect(collab.getCurrentUserSource()).toBe('local')
  expect(collab.getDirectory()).toBeUndefined()
  expect(JSON.parse(collab.saved.get(PROFILE_KEY) ?? 'null')).toEqual(alice)
})

test('a saved local profile restores after confirmed local initialization', async () => {
  const legacyProfile = { ...alice, id: 'dev-legacy' }
  const collab = await setup({ profile: legacyProfile })
  expect(collab.getCurrentUser()).toEqual(legacyProfile)
  expect(collab.getCurrentUserSource()).toBe('local')
  expect(JSON.parse(collab.saved.get(PROFILE_KEY)!)).toEqual(legacyProfile)
})

test('startup creates one local profile after configuration and identity checks, then autosaves the same id', async () => {
  const collab = await setup()
  let changes = 0
  collab.subscribeCurrentUserStore(() => changes++)
  collab.initializeLocalUser(false, {})
  collab.initializeLocalUser(true, undefined)
  collab.initializeLocalUser(true, { provider: 'cloudflare-access' })
  expect(collab.getCurrentUser()).toBeUndefined()
  expect(collab.saved.has(PROFILE_KEY)).toBe(false)
  collab.initializeLocalUser(true, {})
  const profile = collab.getCurrentUser()!
  expect(profile.id).toBeTruthy()
  expect(profile.name).toBeTruthy()
  expect(collab.normalizeUserProfile(profile)).toEqual(profile)
  expect(collab.getCurrentUserSource()).toBe('local')
  expect(JSON.parse(collab.saved.get(PROFILE_KEY)!)).toEqual(profile)
  collab.initializeLocalUser(true, {})
  expect(collab.getCurrentUser()).toBe(profile)
  expect(changes).toBe(1)
  collab.setLocalUser({ ...profile, name: ' Ada Lovelace ', color: 'cyan' })
  expect(collab.getCurrentUser()).toEqual({ ...profile, name: 'Ada Lovelace', color: 'cyan' })
  expect(JSON.parse(collab.saved.get(PROFILE_KEY)!)).toEqual(collab.getCurrentUser())
  expect(collab.getDirectory()).toBeUndefined()
})

test('saved local users stay inactive until collaboration is enabled and the proxy check succeeds', async () => {
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
  Object.defineProperty(globalThis, 'sessionStorage', {
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
test.each([
  ['signed in', { me: 'bob', users: [bob] }, bob],
  ['signed out', { users: [] }, undefined],
  ['signed out with a null id', { me: null, users: [] }, undefined]
] as const)(
  'a host that published before startup stays in charge while %s',
  async (_state, published, expected) => {
    const collab = await setup({ profile: alice, initializeSaved: false })
    collab.api.publishUsers(published)
    collab.initializeLocalUser(true, {})
    expect(collab.getCurrentUser()).toEqual(expected)
    expect(collab.getCurrentUserSource()).toBe('external')
    collab.setLocalUser(alice)
    expect(collab.getCurrentUser()).toEqual(expected)
    expect(JSON.parse(collab.saved.get(PROFILE_KEY) ?? 'null')).toEqual(alice)
    collab.api.publishUsers({ me: 'bob', users: [bob] })
    expect(collab.getCurrentUser()).toEqual(bob)
  }
)

test('a host that publishes after startup replaces the local user', async () => {
  const collab = await setup({ profile: alice })
  expect(collab.getCurrentUserSource()).toBe('local')
  let changes = 0
  collab.subscribeCurrentUserStore(() => changes++)
  collab.api.publishUsers({ me: 'bob', users: [alice, bob] })
  expect([collab.getCurrentUser(), collab.getCurrentUserSource()]).toEqual([bob, 'external'])
  expect(changes).toBe(1)
  // Taking over the source is itself a change, even for an identical profile.
  const late = await setup({ profile: alice })
  late.subscribeCurrentUserStore(() => changes++)
  late.api.publishUsers({ me: 'alice', users: [alice] })
  expect([late.getCurrentUser(), late.getCurrentUserSource()]).toEqual([alice, 'external'])
  expect(changes).toBe(2)
})

test('Cloudflare Access replaces a saved local user, locks edits, and ignores repeats', async () => {
  const collab = await setup({ profile: alice })
  collab.setProxyUserState({})
  expect(collab.getCurrentUser()).toEqual(alice)
  expect(collab.getCurrentUserSource()).toBe('local')
  let notifications = 0
  collab.subscribeCurrentUserStore(() => notifications++)
  collab.setProxyUserState(accessed)
  collab.setProxyUserState({ ...accessed, profile: { ...carol } })
  collab.setLocalUser(bob)
  expect(collab.getCurrentUser()).toEqual(carol)
  expect(collab.getCurrentUserSource()).toBe('cloudflare-access')
  expect(collab.getDirectory()).toBeUndefined()
  expect(notifications).toBe(1)
  collab.setProxyUserState({ provider: 'cloudflare-access' })
  expect(collab.getCurrentUser()).toBeUndefined()
  expect(collab.getCurrentUserSource()).toBe('cloudflare-access')
  collab.setProxyUserState(accessed)
  collab.setProxyUserState({})
  expect(collab.getCurrentUser()).toBeUndefined()
  expect(collab.getCurrentUserSource()).toBeUndefined()
})

test('Access arriving before setup beats a saved local user, and an outer host beats Access', async () => {
  const early = await setup({
    profile: alice,
    beforeInstall: state => state.setProxyUserState(accessed)
  })
  expect(early.getCurrentUser()).toEqual(carol)
  const hosted = await setup({ beforeInstall: state => state.setProxyUserState(accessed) })
  hosted.api.publishUsers({ me: 'bob', users: [bob] })
  hosted.setProxyUserState(accessed)
  expect([hosted.getCurrentUser(), hosted.getCurrentUserSource()]).toEqual([bob, 'external'])
})

test('a published directory is one stable copy, and the viewer is its listed profile', async () => {
  const collab = await setup()
  const users = [alice, bob]
  collab.api.publishUsers({ me: 'alice', users })
  const directory = collab.getDirectory()!
  expect(directory).toEqual([alice, bob])
  expect(directory).not.toBe(users)
  expect(collab.getDirectory()).toBe(directory)
  expect(collab.getCurrentUser()).toBe(directory[0])
})

test('host profiles without colors resolve consistently, while supplied colors win', async () => {
  const collab = await setup()
  collab.api.publishUsers({
    me: 'alice',
    users: [{ id: 'alice', name: 'Alice' }, { id: 'bob' }]
  })
  const aliceColor = colorForId('alice')
  const bobColor = colorForId('bob')
  expect(collab.getCurrentUser()).toEqual({ id: 'alice', name: 'Alice', color: aliceColor })
  expect(collab.getDirectory()).toEqual([
    { id: 'alice', name: 'Alice', color: aliceColor },
    { id: 'bob', color: bobColor }
  ])
  collab.api.publishUsers({
    me: 'alice',
    users: [
      { id: 'alice', color: 'blue' },
      { id: 'bob', color: 'amber' }
    ]
  })
  expect(collab.getCurrentUser()).toEqual({ id: 'alice', color: 'blue' })
  expect(collab.getDirectory()).toEqual([
    { id: 'alice', color: 'blue' },
    { id: 'bob', color: 'amber' }
  ])
})

test('every subscriber sees the complete new state after an atomic replacement', async () => {
  const collab = await setup()
  collab.api.publishUsers({ me: 'alice', users: [alice] })
  const observed: Array<{
    current: UserProfile | undefined
    directory: readonly UserProfile[] | undefined
  }> = []
  const read = () => {
    observed.push({ current: collab.getCurrentUser(), directory: collab.getDirectory() })
  }
  const unsubscribe = [collab.subscribeCurrentUserStore(read), collab.subscribeDirectoryStore(read)]
  collab.api.publishUsers({ me: 'bob', users: [alice, bob] })
  expect(observed).toHaveLength(2)
  for (const state of observed) {
    expect(state.current).toEqual(bob)
    expect(state.directory).toEqual([alice, bob])
  }
  unsubscribe.forEach(stop => stop())
  collab.api.publishUsers({ users: [] })
  expect(observed).toHaveLength(2)
})

test('a profile change is one publish, and an unchanged viewer stays quiet', async () => {
  const collab = await setup()
  collab.api.publishUsers({ me: 'alice', users: [alice, bob] })
  const viewer = collab.getCurrentUser()
  let viewerChanges = 0
  let directoryChanges = 0
  collab.subscribeCurrentUserStore(() => viewerChanges++)
  collab.subscribeDirectoryStore(() => directoryChanges++)
  // Someone else changed: the directory updates, the viewer's profile object does not.
  collab.api.publishUsers({ me: 'alice', users: [{ ...alice }, { ...bob, name: 'Robert' }] })
  expect(collab.getDirectory()).toEqual([alice, { ...bob, name: 'Robert' }])
  expect(collab.getCurrentUser()).toBe(viewer)
  expect([viewerChanges, directoryChanges]).toEqual([0, 1])
  // The viewer changed: the same call updates both.
  collab.api.publishUsers({ me: 'alice', users: [{ ...alice, name: 'Alicia' }, bob] })
  expect(collab.getCurrentUser()).toEqual({ ...alice, name: 'Alicia' })
  expect(collab.getDirectory()?.[0]).toBe(collab.getCurrentUser()!)
  expect([viewerChanges, directoryChanges]).toEqual([1, 2])
})

test('host snapshots preserve nameless current and other users without inventing profile names', async () => {
  const collab = await setup()
  const self = { id: 'viewer', color: 'emerald' } as const
  const other = {
    id: 'other',
    color: 'blue',
    email: 'other@example.test',
    avatar: 'https://example.test/avatar'
  } as const
  collab.api.publishUsers({
    me: 'viewer',
    users: [
      self,
      other,
      { id: 'empty', name: '', color: 'emerald' },
      { id: 'whitespace', name: ' \t ', color: 'blue' }
    ]
  })
  expect(collab.getCurrentUser()).toEqual(self)
  expect(Object.hasOwn(collab.getCurrentUser()!, 'name')).toBe(false)
  const users = collab.getDirectory()!
  expect(users).toEqual([
    self,
    other,
    { id: 'empty', color: 'emerald' },
    { id: 'whitespace', color: 'blue' }
  ])
  expect(Object.hasOwn(users[1]!, 'name')).toBe(false)
  expect(Object.hasOwn(users[2]!, 'name')).toBe(false)
  expect(Object.hasOwn(users[3]!, 'name')).toBe(false)
})

test('optional names and colors still reject invalid values, while ids remain required', async () => {
  const collab = await setup()
  collab.api.publishUsers({ me: 'alice', users: [alice] })
  const previous = collab.getDirectory()
  for (const profile of [
    { color: alice.color },
    { ...alice, id: '' },
    { ...alice, id: ' \t ' },
    { ...alice, id: 'x'.repeat(241) },
    { ...alice, name: 4 },
    { ...alice, name: 'x'.repeat(257) },
    { ...alice, name: 'a\0b' },
    { ...alice, color: 'invalid' },
    { ...alice, color: 42 }
  ]) {
    // The bridge must validate JavaScript callers as well as typed integrations.
    expect(() => collab.api.publishUsers({ users: [profile as UserProfile] })).toThrow()
    expect(collab.getDirectory()).toBe(previous)
  }
  expect(collab.normalizeUserProfile({ id: 'id', name: '' })).toEqual({
    id: 'id',
    color: colorForId('id')
  })
  // Ids are trimmed in profiles, so the viewer's id is matched the same way.
  collab.api.publishUsers({ me: ' bob ', users: [alice, { ...bob, id: ' bob ' }] })
  expect(collab.getCurrentUser()).toEqual(bob)
})

test('removed members are gone, and sign-out shows no one and outranks a saved local user', async () => {
  const collab = await setup({ profile: alice })
  collab.api.publishUsers({ me: 'bob', users: [alice, bob] })
  collab.api.publishUsers({ me: 'bob', users: [bob] })
  expect(collab.getDirectory()).toEqual([bob])
  let viewerChanges = 0
  collab.subscribeCurrentUserStore(() => viewerChanges++)
  // A host that still lists users after sign-out shows no one all the same.
  collab.api.publishUsers({ users: [alice, bob] })
  collab.setLocalUser(alice)
  expect(collab.getCurrentUser()).toBeUndefined()
  expect(collab.getCurrentUserSource()).toBe('external')
  expect(collab.getDirectory()).toEqual([])
  expect(viewerChanges).toBe(1)
  collab.api.publishUsers({ me: 'bob', users: [alice, bob] })
  expect(collab.getCurrentUser()).toEqual(bob)
  expect(collab.getDirectory()).toEqual([alice, bob])
})

test('invalid updates do not partially publish the viewer, directory, source, or notifications', async () => {
  const collab = await setup({ profile: alice })
  const invalidUser = { ...bob, id: '' }
  expect(() => collab.api.publishUsers({ me: 'bob', users: [bob, invalidUser] })).toThrow()
  expect(collab.getCurrentUserSource()).toBe('local')
  expect(collab.getCurrentUser()).toEqual(alice)
  expect(collab.getDirectory()).toBeUndefined()
  collab.api.publishUsers({ me: 'alice', users: [alice] })
  const before = { viewer: collab.getCurrentUser(), directory: collab.getDirectory() }
  let notifications = 0
  collab.subscribeCurrentUserStore(() => notifications++)
  collab.subscribeDirectoryStore(() => notifications++)
  const invalid: unknown[] = [
    { me: 'bob', users: [bob, invalidUser] },
    { me: 'bob', users: [bob, bob] },
    { users: [invalidUser] },
    // The viewer has to be someone in the list.
    { me: 'bob', users: [alice] },
    { me: 'bob', users: [] },
    { me: '', users: [alice] },
    // A JavaScript host may pass shapes that TypeScript rejects.
    { me: 7, users: [alice] },
    { me: 'alice' },
    { me: 'alice', users: { alice } },
    null,
    'alice'
  ]
  for (const next of invalid) {
    expect(() => collab.api.publishUsers(next as HostUsers)).toThrow()
    expect(collab.getCurrentUser()).toBe(before.viewer)
    expect(collab.getDirectory()).toBe(before.directory)
  }
  expect(notifications).toBe(0)
})

test.each(['__proto__', 'constructor', 'toString'])(
  'profiles are immutable and %s is safe as a user id',
  async id => {
    const collab = await setup()
    const viewer = { ...alice }
    const user = { ...bob, id }
    const users: UserProfile[] = [viewer, user]
    collab.api.publishUsers({ me: 'alice', users })
    viewer.name = 'Changed outside'
    user.name = 'Changed outside'
    users.push({ id: 'late', color: 'blue' })
    try {
      collab.getCurrentUser()!.name = 'Changed through getter'
    } catch {
      // A frozen snapshot may throw; either way, the published profile must stay unchanged.
    }
    expect(collab.getCurrentUser()?.name).toBe('Alice')
    expect(collab.getDirectory()).toEqual([alice, { ...bob, id }])
    collab.api.publishUsers({ me: id, users: [alice, { ...bob, id }] })
    expect(collab.getCurrentUser()).toEqual({ ...bob, id })
  }
)
