import { afterEach, expect, test } from 'bun:test'

import type { CollabIdentity } from '@/lib/collab/types'

import type * as Identity from './identity'
import type { CollabHostState, CollabIdentityApi, WorkspaceDirectory } from './identity'

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

async function setup(getHostState?: () => CollabHostState | null, profile?: CollabIdentity) {
  const host: { moi?: { collab?: Partial<CollabIdentityApi> } } = getHostState
    ? { moi: { collab: { getHostState } } }
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
  expect(identity.getHostState()).toBeNull()
  expect(identity.getWorkspaceDirectory('a')).toEqual({ status: 'unavailable', users: [] })
  expect(identity.getWorkspaceUsers('a')).toBeNull()
  expect(identity.saved.has(PROFILE_KEY)).toBe(false)
  identity.setDevIdentity(alice)
  expect(identity.getIdentity()).toEqual(alice)
  expect(identity.getIdentitySource()).toBe('dev')
  expect(identity.getHostState()).toBeNull()
  expect(JSON.parse(identity.saved.get(PROFILE_KEY) ?? 'null')).toEqual(alice)
})

test('an explicitly saved dev profile restores when no external provider is configured', async () => {
  const identity = await setup(undefined, alice)
  expect(identity.getIdentity()).toEqual(alice)
  expect(identity.getIdentitySource()).toBe('dev')
})

test.each([
  ['signed in', (): CollabHostState => ({ identity: bob, workspaces: {} }), bob],
  ['signed out', (): CollabHostState => ({ identity: null, workspaces: {} }), null],
  [
    'unavailable',
    (): CollabHostState => {
      throw new Error('Provider unavailable')
    },
    null
  ]
] as const)('an injected provider remains in charge while %s', async (_state, getter, expected) => {
  const identity = await setup(getter, alice)
  expect(identity.getIdentity()).toEqual(expected)
  expect(identity.getIdentitySource()).toBe('external')
  expect(identity.getWorkspaceDirectory('a')).toEqual({ status: 'loading', users: [] })
  identity.setDevIdentity(alice)
  expect(identity.getIdentity()).toEqual(expected)
  expect(JSON.parse(identity.saved.get(PROFILE_KEY) ?? 'null')).toEqual(alice)
  identity.host.moi?.collab?.setHostState?.({ identity: bob, workspaces: {} })
  expect(identity.getIdentity()).toEqual(bob)
})

test('preloaded state exposes stable copied identity and directories across later workspace visits', async () => {
  const input: CollabHostState = {
    identity: alice,
    workspaces: { a: { status: 'ready', users: [alice, bob] }, b: { status: 'loading' } }
  }
  let reads = 0
  const identity = await setup(() => {
    reads++
    return input
  })
  const state = identity.getHostState()!
  expect(state).toEqual(input)
  expect(identity.getHostState()).toBe(state)
  expect(state).not.toBe(input)
  expect(Object.is(identity.getWorkspaceDirectory('a'), state.workspaces.a)).toBe(true)
  expect(identity.getWorkspaceDirectory('b')).toEqual({ status: 'loading', users: [] })
  expect(identity.getWorkspaceDirectory('unknown')).toEqual({ status: 'loading', users: [] })
  expect(identity.getWorkspaceUsers('unknown')).toEqual([])
  expect(reads).toBe(1)
  expect(Object.isFrozen(state)).toBe(true)
  expect(Object.isFrozen(state.identity)).toBe(true)
  expect(Object.isFrozen(state.workspaces)).toBe(true)
  const directory = identity.getWorkspaceDirectory('a')
  expect(Object.isFrozen(directory)).toBe(true)
  expect(Object.isFrozen(directory.users)).toBe(true)
  expect(Object.isFrozen(directory.users[1])).toBe(true)
})

test('every subscriber sees the complete new state after an atomic replacement', async () => {
  const identity = await setup(() => ({
    identity: alice,
    workspaces: { a: { status: 'ready', users: [alice] } }
  }))
  const observed: Array<{
    current: CollabIdentity | null
    a: WorkspaceDirectory
    b: WorkspaceDirectory
    host: CollabHostState | null
  }> = []
  const read = () => {
    observed.push({
      current: identity.getIdentity(),
      a: identity.getWorkspaceDirectory('a'),
      b: identity.getWorkspaceDirectory('b'),
      host: identity.getHostState()
    })
  }
  const unsubscribe = [
    identity.subscribeIdentityStore(read),
    identity.subscribeWorkspaceUsersStore('a', read),
    identity.subscribeWorkspaceUsersStore('b', read),
    identity.subscribeHostStateStore(read)
  ]
  identity.setHostState({
    identity: bob,
    workspaces: {
      a: { status: 'ready', users: [bob] },
      b: { status: 'ready', users: [alice, bob] }
    }
  })
  expect(observed).toHaveLength(4)
  for (const state of observed) {
    expect(state.current).toEqual(bob)
    expect(state.a).toEqual({ status: 'ready', users: [bob] })
    expect(state.b).toEqual({ status: 'ready', users: [alice, bob] })
    expect(state.host).toBe(identity.getHostState())
  }
  unsubscribe.forEach(stop => stop())
  identity.setHostState({ identity: null, workspaces: {} })
  expect(observed).toHaveLength(4)
})

test('global identity supplies the same own profile in every membership list without adding membership', async () => {
  const identity = await setup()
  identity.setHostState({
    identity: { ...alice, name: 'Alicia', email: 'alice@example.test' },
    workspaces: {
      a: { status: 'ready', users: [alice, bob] },
      b: { status: 'ready', users: [{ ...alice, name: 'Different old name' }] },
      c: { status: 'ready', users: [bob] }
    }
  })
  expect(identity.getWorkspaceUsers('a')?.[0]).toBe(identity.getIdentity()!)
  expect(identity.getWorkspaceUsers('b')?.[0]).toBe(identity.getIdentity()!)
  expect(identity.getWorkspaceUsers('a')?.[0]?.name).toBe('Alicia')
  expect(identity.getWorkspaceUsers('c')).toEqual([bob])
  identity.setHostState({
    identity: { ...alice, name: 'Alice updated again' },
    workspaces: identity.getHostState()!.workspaces
  })
  expect(identity.getWorkspaceUsers('a')?.[0]?.name).toBe('Alice updated again')
  expect(identity.getWorkspaceUsers('b')?.[0]).toBe(identity.getIdentity()!)
  expect(identity.getWorkspaceUsers('c')).toEqual([bob])
})

test('host snapshots preserve nameless current and other users without inventing profile names', async () => {
  const identity = await setup()
  const self = { id: 'viewer', color: '#0f766e' }
  const other = {
    id: 'other',
    color: '#2563eb',
    email: 'other@example.test',
    avatar: 'https://example.test/avatar'
  }
  identity.setHostState({
    identity: self,
    workspaces: {
      a: {
        status: 'ready',
        users: [
          { ...self, name: 'Old viewer name' },
          other,
          { id: 'empty', name: '', color: '#0f766e' },
          { id: 'whitespace', name: ' \t ', color: '#2563eb' }
        ]
      }
    }
  })
  expect(identity.getIdentity()).toEqual(self)
  expect(Object.hasOwn(identity.getIdentity()!, 'name')).toBe(false)
  const users = identity.getWorkspaceUsers('a')!
  expect(users).toEqual([
    self,
    other,
    { id: 'empty', name: '', color: '#0f766e' },
    { id: 'whitespace', name: '', color: '#2563eb' }
  ])
  expect(Object.hasOwn(users[0]!, 'name')).toBe(false)
  expect(Object.hasOwn(users[1]!, 'name')).toBe(false)
  identity.setHostState({
    identity: { ...self, name: '' },
    workspaces: identity.getHostState()!.workspaces
  })
  expect(identity.getIdentity()).toEqual({ ...self, name: '' })
  expect(identity.getWorkspaceUsers('a')?.[0]).toBe(identity.getIdentity()!)
})

test('optional names still reject invalid types and bounds, while ids remain required', async () => {
  const identity = await setup()
  identity.setHostState({ identity: alice, workspaces: {} })
  const previous = identity.getHostState()
  for (const profile of [
    { color: alice.color },
    { ...alice, id: '' },
    { ...alice, id: ' \t ' },
    { ...alice, id: null },
    { ...alice, id: 'x'.repeat(241) },
    { ...alice, name: null },
    { ...alice, name: 4 },
    { ...alice, name: 'x'.repeat(257) },
    { ...alice, name: 'a\0b' }
  ]) {
    // The bridge must validate JavaScript callers as well as typed integrations.
    expect(() =>
      identity.setHostState({ identity: profile as CollabIdentity, workspaces: {} })
    ).toThrow()
    expect(identity.getHostState()).toBe(previous)
  }
  expect(identity.normalizeIdentity({ id: 'id', name: '', color: 'invalid' })).toEqual({
    id: 'id',
    name: '',
    color: '#0f766e'
  })
})

test('loading, empty, removed workspaces, and removed members remain distinct and authoritative', async () => {
  const identity = await setup()
  identity.setHostState({
    identity: alice,
    workspaces: {
      loading: { status: 'loading' },
      empty: { status: 'ready', users: [] },
      members: { status: 'ready', users: [alice, bob] }
    }
  })
  expect(identity.getWorkspaceDirectory('loading').status).toBe('loading')
  expect(identity.getWorkspaceDirectory('empty')).toEqual({ status: 'ready', users: [] })
  identity.setHostState({
    identity: alice,
    workspaces: { members: { status: 'ready', users: [] } }
  })
  expect(identity.getWorkspaceDirectory('members')).toEqual({ status: 'ready', users: [] })
  expect(identity.getWorkspaceDirectory('empty').status).toBe('loading')
  expect(identity.getWorkspaceUsers('members')).toEqual([])
})

test('sign-out atomically clears directories and remains authoritative over a saved dev identity', async () => {
  const identity = await setup(undefined, alice)
  identity.setHostState({
    identity: bob,
    workspaces: { a: { status: 'ready', users: [alice, bob] } }
  })
  const observed: Array<CollabHostState | null> = []
  const unsubscribe = identity.subscribeHostState(state => observed.push(state))
  expect(observed).toEqual([identity.getHostState()])
  identity.setHostState({ identity: null, workspaces: identity.getHostState()!.workspaces })
  identity.setDevIdentity(alice)
  expect(identity.getIdentity()).toBeNull()
  expect(identity.getIdentitySource()).toBe('external')
  expect(identity.getHostState()).toEqual({ identity: null, workspaces: {} })
  expect(identity.getWorkspaceUsers('a')).toEqual([])
  expect(observed.at(-1)).toBe(identity.getHostState())
  unsubscribe()
  identity.setHostState({ identity: bob, workspaces: {} })
  expect(observed).toHaveLength(2)
})

test('invalid updates do not partially publish identity, directory, source, or notifications', async () => {
  const identity = await setup(undefined, alice)
  const invalidUser = { ...bob, id: '' }
  expect(() =>
    identity.setHostState({
      identity: bob,
      workspaces: { invalid: { status: 'ready', users: [invalidUser] } }
    })
  ).toThrow()
  expect(identity.getIdentitySource()).toBe('dev')
  expect(identity.getIdentity()).toEqual(alice)
  expect(identity.getHostState()).toBeNull()
  identity.setHostState({ identity: alice, workspaces: { a: { status: 'ready', users: [alice] } } })
  const before = identity.getHostState()
  let notifications = 0
  identity.subscribeHostStateStore(() => notifications++)
  const invalidStates: CollabHostState[] = [
    { identity: { ...bob, id: '' }, workspaces: {} },
    {
      identity: bob,
      workspaces: {
        valid: { status: 'ready', users: [bob] },
        invalid: { status: 'ready', users: [invalidUser] }
      }
    },
    { identity: bob, workspaces: { a: { status: 'ready', users: [alice, alice] } } },
    { identity: null, workspaces: { invalid: { status: 'ready', users: [invalidUser] } } },
    // A JavaScript host may pass shapes that TypeScript rejects.
    { identity: bob, workspaces: [] } as unknown as CollabHostState,
    { identity: bob, workspaces: { a: { status: 'invalid' } } } as unknown as CollabHostState
  ]
  for (const invalid of invalidStates) {
    expect(() => identity.setHostState(invalid)).toThrow()
    expect(identity.getHostState()).toBe(before)
    expect(identity.getIdentity()).toBe(before!.identity)
  }
  expect(notifications).toBe(0)
})

test.each(['__proto__', 'constructor', 'toString'])(
  'profiles are immutable and %s is safe as a workspace and user id',
  async id => {
    const identity = await setup()
    const user = { ...bob, id }
    const users: CollabIdentity[] = [user]
    const state = {
      identity: { ...alice },
      workspaces: {
        [id]: { status: 'ready' as const, users },
        ordinary: { status: 'ready' as const, users: [alice] }
      }
    }
    identity.setHostState(state)
    state.identity.name = 'Changed outside'
    user.name = 'Changed outside'
    users.push(alice)
    expect(identity.getIdentity()?.name).toBe('Alice')
    expect(identity.getWorkspaceUsers(id)).toEqual([{ ...bob, id }])
    expect(identity.getWorkspaceUsers('ordinary')).toEqual([alice])
    expect(identity.getWorkspaceDirectory('hasOwnProperty').status).toBe('loading')
    identity.setWorkspaceUsers(id, [alice])
    expect(identity.getWorkspaceUsers(id)).toEqual([alice])
    expect(identity.getWorkspaceUsers('ordinary')).toEqual([alice])
  }
)

test('the outer bridge exposes atomic host state and share methods only', async () => {
  const identity = await setup()
  expect(Object.keys(identity.host.moi!.collab!).sort()).toEqual([
    'getHostState',
    'setHostState',
    'setShareHandler',
    'subscribeHostState'
  ])
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
