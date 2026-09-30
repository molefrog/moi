import { afterEach, expect, test } from 'bun:test'

import { colorForId } from '@/lib/collab/colors'
import type { UserProfile } from '@/lib/collab/types'

import type * as HostState from './host-state'
import type {
  CollabHostState,
  CollabHostStateInput,
  CollabHostApi,
  WorkspaceDirectory
} from './host-state'

const PROFILE_KEY = 'moi:collab:dev-profile'
const alice = { id: 'alice', name: 'Alice', color: 'emerald' } satisfies UserProfile
const bob = { id: 'bob', name: 'Bob', color: 'blue' } satisfies UserProfile
const carol = { id: 'cf-carol', color: 'emerald', email: 'carol@example.com' } as const
const accessed = { provider: 'cloudflare-access', profile: carol } as const
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

async function setup(
  getHostState?: () => CollabHostStateInput | null,
  profile?: UserProfile,
  beforeInstall?: (state: typeof HostState) => void
) {
  const host: {
    moi?: {
      collab?: {
        getHostState?: () => CollabHostStateInput | null
      }
    }
  } = getHostState ? { moi: { collab: { getHostState } } } : {}
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
  const collab: typeof HostState = await import(path)
  beforeInstall?.(collab)
  collab.installHostApi()
  // Installation replaces the bootstrap getter with the complete bridge.
  const api = host.moi?.collab as CollabHostApi
  return { ...collab, host, api, saved }
}

test('current user starts empty and persists only an explicitly enabled dev profile', async () => {
  const collab = await setup()
  expect(collab.getCurrentUser()).toBeNull()
  expect(collab.getCurrentUserSource()).toBeNull()
  expect(collab.getHostState()).toBeNull()
  expect(collab.getWorkspaceDirectory('a')).toEqual({ status: 'unavailable', users: [] })
  expect(collab.getWorkspaceUsers('a')).toBeNull()
  expect(collab.saved.has(PROFILE_KEY)).toBe(false)
  collab.setDevUser(alice)
  expect(collab.getCurrentUser()).toEqual(alice)
  expect(collab.getCurrentUserSource()).toBe('dev')
  expect(collab.getHostState()).toBeNull()
  expect(JSON.parse(collab.saved.get(PROFILE_KEY) ?? 'null')).toEqual(alice)
})

test('an explicitly saved dev profile restores when no external provider is configured', async () => {
  const collab = await setup(undefined, alice)
  expect(collab.getCurrentUser()).toEqual(alice)
  expect(collab.getCurrentUserSource()).toBe('dev')
})

test.each([
  ['signed in', (): CollabHostState => ({ currentUser: bob, workspaces: {} }), bob],
  ['signed out', (): CollabHostState => ({ currentUser: null, workspaces: {} }), null],
  [
    'unavailable',
    (): CollabHostState => {
      throw new Error('Provider unavailable')
    },
    null
  ]
] as const)('an injected provider remains in charge while %s', async (_state, getter, expected) => {
  const collab = await setup(getter, alice)
  expect(collab.getCurrentUser()).toEqual(expected)
  expect(collab.getCurrentUserSource()).toBe('external')
  expect(collab.getWorkspaceDirectory('a')).toEqual({ status: 'loading', users: [] })
  collab.setDevUser(alice)
  expect(collab.getCurrentUser()).toEqual(expected)
  expect(JSON.parse(collab.saved.get(PROFILE_KEY) ?? 'null')).toEqual(alice)
  collab.api.setHostState({ currentUser: bob, workspaces: {} })
  expect(collab.getCurrentUser()).toEqual(bob)
})

test('Cloudflare Access replaces a saved test user, locks edits, and ignores repeats', async () => {
  const collab = await setup(undefined, alice)
  let notifications = 0
  collab.subscribeCurrentUserStore(() => notifications++)
  collab.setProxyUserState(accessed)
  collab.setProxyUserState({ ...accessed, profile: { ...carol } })
  collab.setDevUser(bob)
  expect(collab.getCurrentUser()).toEqual(carol)
  expect(collab.getCurrentUserSource()).toBe('cloudflare-access')
  expect(notifications).toBe(1)
  collab.setProxyUserState({ provider: 'cloudflare-access', profile: null })
  expect(collab.getCurrentUser()).toBeNull()
  collab.setProxyUserState({ provider: null, profile: null })
  expect(collab.getCurrentUserSource()).toBeNull()
})

test('Access arriving before setup beats a saved test user, and an outer host beats Access', async () => {
  const early = await setup(undefined, alice, state => state.setProxyUserState(accessed))
  expect(early.getCurrentUser()).toEqual(carol)
  const hosted = await setup(
    () => ({ currentUser: bob, workspaces: {} }),
    undefined,
    state => state.setProxyUserState(accessed)
  )
  hosted.setProxyUserState(accessed)
  expect([hosted.getCurrentUser(), hosted.getCurrentUserSource()]).toEqual([bob, 'external'])
})

test('preloaded state exposes stable copied current user and directories across later workspace visits', async () => {
  const input: CollabHostState = {
    currentUser: alice,
    workspaces: { a: { status: 'ready', users: [alice, bob] }, b: { status: 'loading' } }
  }
  let reads = 0
  const collab = await setup(() => {
    reads++
    return input
  })
  const state = collab.getHostState()!
  expect(state).toEqual(input)
  expect(collab.getHostState()).toBe(state)
  expect(state).not.toBe(input)
  expect(Object.is(collab.getWorkspaceDirectory('a'), state.workspaces.a)).toBe(true)
  expect(collab.getWorkspaceDirectory('b')).toEqual({ status: 'loading', users: [] })
  expect(collab.getWorkspaceDirectory('unknown')).toEqual({ status: 'loading', users: [] })
  expect(collab.getWorkspaceUsers('unknown')).toEqual([])
  expect(reads).toBe(1)
  expect(Object.isFrozen(state)).toBe(true)
  expect(Object.isFrozen(state.currentUser)).toBe(true)
  expect(Object.isFrozen(state.workspaces)).toBe(true)
  const directory = collab.getWorkspaceDirectory('a')
  expect(Object.isFrozen(directory)).toBe(true)
  expect(Object.isFrozen(directory.users)).toBe(true)
  expect(Object.isFrozen(directory.users[1])).toBe(true)
})

test('host profiles without colors resolve consistently, while supplied colors win', async () => {
  const collab = await setup(() => ({
    currentUser: { id: 'alice', name: 'Alice' },
    workspaces: {
      first: { status: 'ready', users: [{ id: 'alice' }, { id: 'bob' }] },
      second: { status: 'ready', users: [{ id: 'alice' }, { id: 'bob' }] }
    }
  }))
  const aliceColor = colorForId('alice')
  const bobColor = colorForId('bob')
  expect(collab.getCurrentUser()).toEqual({ id: 'alice', name: 'Alice', color: aliceColor })
  expect(collab.getWorkspaceUsers('first')).toEqual([
    { id: 'alice', name: 'Alice', color: aliceColor },
    { id: 'bob', color: bobColor }
  ])
  expect(collab.getWorkspaceUsers('second')).toEqual(collab.getWorkspaceUsers('first'))
  expect(collab.getWorkspaceUsers('first')?.[0]).toBe(collab.getCurrentUser()!)
  expect(collab.getWorkspaceUsers('second')?.[0]).toBe(collab.getCurrentUser()!)
  collab.setHostState({
    currentUser: { id: 'alice', color: 'blue' },
    workspaces: {
      first: { status: 'ready', users: [{ id: 'alice' }, { id: 'bob', color: 'amber' }] }
    }
  })
  expect(collab.getWorkspaceUsers('first')).toEqual([
    { id: 'alice', color: 'blue' },
    { id: 'bob', color: 'amber' }
  ])
})

test('every subscriber sees the complete new state after an atomic replacement', async () => {
  const collab = await setup(() => ({
    currentUser: alice,
    workspaces: { a: { status: 'ready', users: [alice] } }
  }))
  const observed: Array<{
    current: UserProfile | null
    a: WorkspaceDirectory
    b: WorkspaceDirectory
    host: CollabHostState | null
  }> = []
  const read = () => {
    observed.push({
      current: collab.getCurrentUser(),
      a: collab.getWorkspaceDirectory('a'),
      b: collab.getWorkspaceDirectory('b'),
      host: collab.getHostState()
    })
  }
  const unsubscribe = [
    collab.subscribeCurrentUserStore(read),
    collab.subscribeWorkspaceUsersStore('a', read),
    collab.subscribeWorkspaceUsersStore('b', read),
    collab.subscribeHostStateStore(read)
  ]
  collab.setHostState({
    currentUser: bob,
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
    expect(state.host).toBe(collab.getHostState())
  }
  unsubscribe.forEach(stop => stop())
  collab.setHostState({ currentUser: null, workspaces: {} })
  expect(observed).toHaveLength(4)
})

test('the current user supplies the same own profile in every membership list without adding membership', async () => {
  const collab = await setup()
  collab.setHostState({
    currentUser: { ...alice, name: 'Alicia', email: 'alice@example.test' },
    workspaces: {
      a: { status: 'ready', users: [alice, bob] },
      b: { status: 'ready', users: [{ ...alice, name: 'Different old name' }] },
      c: { status: 'ready', users: [bob] }
    }
  })
  expect(collab.getWorkspaceUsers('a')?.[0]).toBe(collab.getCurrentUser()!)
  expect(collab.getWorkspaceUsers('b')?.[0]).toBe(collab.getCurrentUser()!)
  expect(collab.getWorkspaceUsers('a')?.[0]?.name).toBe('Alicia')
  expect(collab.getWorkspaceUsers('c')).toEqual([bob])
  collab.setHostState({
    currentUser: { ...alice, name: 'Alice updated again' },
    workspaces: collab.getHostState()!.workspaces
  })
  expect(collab.getWorkspaceUsers('a')?.[0]?.name).toBe('Alice updated again')
  expect(collab.getWorkspaceUsers('b')?.[0]).toBe(collab.getCurrentUser()!)
  expect(collab.getWorkspaceUsers('c')).toEqual([bob])
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
  collab.setHostState({
    currentUser: self,
    workspaces: {
      a: {
        status: 'ready',
        users: [
          { ...self, name: 'Old viewer name' },
          other,
          { id: 'empty', name: '', color: 'emerald' },
          { id: 'whitespace', name: ' \t ', color: 'blue' }
        ]
      }
    }
  })
  expect(collab.getCurrentUser()).toEqual(self)
  expect(Object.hasOwn(collab.getCurrentUser()!, 'name')).toBe(false)
  const users = collab.getWorkspaceUsers('a')!
  expect(users).toEqual([
    self,
    other,
    { id: 'empty', color: 'emerald' },
    { id: 'whitespace', color: 'blue' }
  ])
  expect(Object.hasOwn(users[0]!, 'name')).toBe(false)
  expect(Object.hasOwn(users[1]!, 'name')).toBe(false)
  collab.setHostState({
    currentUser: { ...self, name: '' },
    workspaces: collab.getHostState()!.workspaces
  })
  expect(collab.getCurrentUser()).toEqual(self)
  expect(collab.getWorkspaceUsers('a')?.[0]).toBe(collab.getCurrentUser()!)
})

test('optional names and colors still reject invalid values, while ids remain required', async () => {
  const collab = await setup()
  collab.setHostState({ currentUser: alice, workspaces: {} })
  const previous = collab.getHostState()
  for (const profile of [
    { color: alice.color },
    { ...alice, id: '' },
    { ...alice, id: ' \t ' },
    { ...alice, id: null },
    { ...alice, id: 'x'.repeat(241) },
    { ...alice, name: null },
    { ...alice, name: 4 },
    { ...alice, name: 'x'.repeat(257) },
    { ...alice, name: 'a\0b' },
    { ...alice, color: null },
    { ...alice, color: '' },
    { ...alice, color: 'red' },
    { ...alice, color: 'invalid' },
    { ...alice, color: '#123456' },
    { ...alice, color: '#12345' },
    { ...alice, color: 42 }
  ]) {
    // The bridge must validate JavaScript callers as well as typed integrations.
    expect(() =>
      collab.setHostState({ currentUser: profile as UserProfile, workspaces: {} })
    ).toThrow()
    expect(collab.getHostState()).toBe(previous)
  }
  expect(collab.normalizeUserProfile({ id: 'id', name: '' })).toEqual({
    id: 'id',
    color: colorForId('id')
  })
})

test('loading, empty, removed workspaces, and removed members remain distinct and authoritative', async () => {
  const collab = await setup()
  collab.setHostState({
    currentUser: alice,
    workspaces: {
      loading: { status: 'loading' },
      empty: { status: 'ready', users: [] },
      members: { status: 'ready', users: [alice, bob] }
    }
  })
  expect(collab.getWorkspaceDirectory('loading').status).toBe('loading')
  expect(collab.getWorkspaceDirectory('empty')).toEqual({ status: 'ready', users: [] })
  collab.setHostState({
    currentUser: alice,
    workspaces: { members: { status: 'ready', users: [] } }
  })
  expect(collab.getWorkspaceDirectory('members')).toEqual({ status: 'ready', users: [] })
  expect(collab.getWorkspaceDirectory('empty').status).toBe('loading')
  expect(collab.getWorkspaceUsers('members')).toEqual([])
})

test('sign-out atomically clears directories and remains authoritative over a saved dev user', async () => {
  const collab = await setup(undefined, alice)
  collab.setHostState({
    currentUser: bob,
    workspaces: { a: { status: 'ready', users: [alice, bob] } }
  })
  const observed: Array<CollabHostState | null> = []
  const unsubscribe = collab.subscribeHostState(state => observed.push(state))
  expect(observed).toEqual([collab.getHostState()])
  collab.setHostState({ currentUser: null, workspaces: collab.getHostState()!.workspaces })
  collab.setDevUser(alice)
  expect(collab.getCurrentUser()).toBeNull()
  expect(collab.getCurrentUserSource()).toBe('external')
  expect(collab.getHostState()).toEqual({ currentUser: null, workspaces: {} })
  expect(collab.getWorkspaceUsers('a')).toEqual([])
  expect(observed.at(-1)).toBe(collab.getHostState())
  unsubscribe()
  collab.setHostState({ currentUser: bob, workspaces: {} })
  expect(observed).toHaveLength(2)
})

test('invalid updates do not partially publish current user, directory, source, or notifications', async () => {
  const collab = await setup(undefined, alice)
  const invalidUser = { ...bob, id: '' }
  expect(() =>
    collab.setHostState({
      currentUser: bob,
      workspaces: { invalid: { status: 'ready', users: [invalidUser] } }
    })
  ).toThrow()
  expect(collab.getCurrentUserSource()).toBe('dev')
  expect(collab.getCurrentUser()).toEqual(alice)
  expect(collab.getHostState()).toBeNull()
  collab.setHostState({
    currentUser: alice,
    workspaces: { a: { status: 'ready', users: [alice] } }
  })
  const before = collab.getHostState()
  let notifications = 0
  collab.subscribeHostStateStore(() => notifications++)
  const invalidStates: CollabHostState[] = [
    { currentUser: { ...bob, id: '' }, workspaces: {} },
    {
      currentUser: bob,
      workspaces: {
        valid: { status: 'ready', users: [bob] },
        invalid: { status: 'ready', users: [invalidUser] }
      }
    },
    { currentUser: bob, workspaces: { a: { status: 'ready', users: [alice, alice] } } },
    { currentUser: null, workspaces: { invalid: { status: 'ready', users: [invalidUser] } } },
    // A JavaScript host may pass shapes that TypeScript rejects.
    { currentUser: bob, workspaces: [] } as unknown as CollabHostState,
    { currentUser: bob, workspaces: { a: { status: 'invalid' } } } as unknown as CollabHostState
  ]
  for (const invalid of invalidStates) {
    expect(() => collab.setHostState(invalid)).toThrow()
    expect(collab.getHostState()).toBe(before)
    expect(collab.getCurrentUser()).toBe(before!.currentUser)
  }
  expect(notifications).toBe(0)
})

test.each(['__proto__', 'constructor', 'toString'])(
  'profiles are immutable and %s is safe as a workspace and user id',
  async id => {
    const collab = await setup()
    const user = { ...bob, id }
    const users: UserProfile[] = [user]
    const state = {
      currentUser: { ...alice },
      workspaces: {
        [id]: { status: 'ready' as const, users },
        ordinary: { status: 'ready' as const, users: [alice] }
      }
    }
    collab.setHostState(state)
    state.currentUser.name = 'Changed outside'
    user.name = 'Changed outside'
    users.push(alice)
    expect(collab.getCurrentUser()?.name).toBe('Alice')
    expect(collab.getWorkspaceUsers(id)).toEqual([{ ...bob, id }])
    expect(collab.getWorkspaceUsers('ordinary')).toEqual([alice])
    expect(collab.getWorkspaceDirectory('hasOwnProperty').status).toBe('loading')
    collab.setWorkspaceUsers(id, [alice])
    expect(collab.getWorkspaceUsers(id)).toEqual([alice])
    expect(collab.getWorkspaceUsers('ordinary')).toEqual([alice])
  }
)

test('the outer bridge exposes atomic host state and share methods only', async () => {
  const collab = await setup()
  expect(Object.keys(collab.host.moi!.collab!).sort()).toEqual([
    'getHostState',
    'setHostState',
    'setShareHandler',
    'subscribeHostState'
  ])
})

test('the outer share bridge uses its URL and rejects unsafe destinations', async () => {
  const collab = await setup()
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
  const api = collab.api
  api.setShareHandler(async context => {
    expect(context.workspaceId).toBe('board')
    return { url: 'https://cloud.example/share/board' }
  })
  expect(await collab.shareWorkspace('board')).toBe('copied')
  expect(copied).toEqual(['https://cloud.example/share/board'])
  api.setShareHandler(null)
  await collab.shareWorkspace('board')
  expect(copied.at(-1)).toBe('https://moi.example/workspace/board')
  api.setShareHandler(async () => ({ url: 'javascript:alert(1)' }))
  await expect(collab.shareWorkspace('board')).rejects.toThrow('invalid URL')
  expect(copied).toHaveLength(2)
})
