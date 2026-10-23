import { afterEach, expect, spyOn, test } from 'bun:test'
import { QueryClient } from '@tanstack/react-query'
import {
  accountKeys,
  CloudApiError,
  cloudRequest,
  cancelInvitation,
  inviteMember,
  removeMember,
  sessionQuery,
  signOutCloud,
  teamQuery,
  updateCloudName
} from './api'
import type { CloudTeam } from './api'

const user = { id: 'alex', name: 'Alex', email: 'alex@example.com', isAnonymous: false }
const member = {
  id: 'membership',
  userId: user.id,
  name: user.name,
  email: user.email,
  role: 'owner',
  me: true
}
const invitation = {
  id: 'invite',
  email: 'ada@example.com',
  role: 'member',
  expiresAt: '2026-11-01T00:00:00Z'
}
const team = { id: 'org', name: 'Moi', role: 'owner', members: [member], invitations: [invitation] }
const originalFetch = globalThis.fetch
const clients: QueryClient[] = []

afterEach(() => {
  globalThis.fetch = originalFetch
  for (const client of clients) client.clear()
  clients.length = 0
})

function respond(value: unknown) {
  spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(value))
}

function createClient() {
  const client = new QueryClient()
  clients.push(client)
  return client
}

test.each([
  { body: { error: 'Sign in first', code: 'UNAUTHORIZED' }, message: 'Sign in first' },
  { body: { message: 'Session expired', code: 'SESSION_EXPIRED' }, message: 'Session expired' },
  { body: { error: 'Gateway error', message: 'Provider error' }, message: 'Gateway error' },
  { body: { error: null, message: 'Provider error' }, message: 'Provider error' },
  { body: { error: ' ', message: 'Provider error' }, message: 'Provider error' },
  { body: { message: '' }, message: 'Couldn’t complete this request. Try again.' },
  { body: { message: 42 }, message: 'Couldn’t complete this request. Try again.' }
])('reads cloud error messages: %j', async ({ body, message }) => {
  spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(body, { status: 401 }))
  const error = await cloudRequest('get-session').catch((error: unknown) => error)
  expect(error).toBeInstanceOf(CloudApiError)
  expect(error).toMatchObject({ message, status: 401 })
})

test('uses the fallback for non-JSON errors and preserves the status', async () => {
  spyOn(globalThis, 'fetch').mockResolvedValue(new Response('Bad gateway', { status: 502 }))
  const error = await cloudRequest('sign-out', { method: 'POST' }).catch((error: unknown) => error)
  expect(error).toBeInstanceOf(CloudApiError)
  expect(error).toMatchObject({
    message: 'Couldn’t complete this request. Try again.',
    status: 502
  })
})

test('accepts signed-out, anonymous, and registered sessions, including an empty name', async () => {
  for (const value of [null, { user }, { user: { ...user, name: '', isAnonymous: true } }]) {
    respond(value)
    const client = createClient()
    expect(await client.fetchQuery(sessionQuery)).toEqual(value)
  }
})

test.each([
  {},
  { user: null },
  { user: { ...user, id: '' } },
  { user: { ...user, id: ' alex ' } },
  { user: { ...user, name: null } },
  { user: { ...user, email: null } },
  { user: { ...user, email: 'a'.repeat(321) } },
  { user: { ...user, name: 'a'.repeat(257) } },
  { user: { ...user, isAnonymous: 'false' } }
])('rejects malformed sessions as query errors: %j', async value => {
  respond(value)
  const client = createClient()
  await expect(client.fetchQuery(sessionQuery)).rejects.toThrow('Invalid account response')
  expect(client.getQueryState(accountKeys.session)?.status).toBe('error')
  expect(client.getQueryData(accountKeys.session)).toBeUndefined()
})

test('accepts users with empty names and an empty users list', async () => {
  for (const value of [
    team,
    { ...team, members: [{ ...member, name: '' }] },
    { ...team, members: [], invitations: [] }
  ]) {
    respond(value)
    const client = createClient()
    expect(await client.fetchQuery(teamQuery(user.id))).toEqual(value)
  }
})

test.each([
  null,
  {},
  { ...team, members: null },
  { ...team, members: [null] },
  { ...team, members: [{ ...member, name: null }] },
  { ...team, members: [{ ...member, email: null }] },
  { ...team, members: [{ ...member, email: 'a'.repeat(321) }] },
  { ...team, members: [member, { ...member, id: 'another-membership' }] },
  { ...team, members: [member, { ...member, userId: 'ada' }] },
  { ...team, invitations: null },
  { ...team, invitations: [null] },
  { ...team, invitations: [{ ...invitation, email: null }] },
  { ...team, invitations: [{ ...invitation, expiresAt: 'invalid' }] },
  { ...team, invitations: [invitation, invitation] }
])('rejects malformed users as query errors: %j', async value => {
  respond(value)
  const client = createClient()
  const query = teamQuery(user.id)
  await expect(client.fetchQuery(query)).rejects.toThrow('Invalid users response')
  expect(client.getQueryState(query.queryKey)?.status).toBe('error')
  expect(client.getQueryData(query.queryKey)).toBeUndefined()
})

test('a malformed refresh preserves the last valid users response', async () => {
  respond(null)
  const client = createClient()
  const query = teamQuery(user.id)
  client.setQueryData(query.queryKey, team)
  await client.invalidateQueries({ queryKey: query.queryKey })
  await expect(client.fetchQuery(query)).rejects.toThrow('Invalid users response')
  expect(client.getQueryData<CloudTeam>(query.queryKey)).toEqual(team)
})

test.each([
  { path: 'profile', action: () => updateCloudName('Ada'), body: { name: 'Ada' } },
  { path: 'sign-out', action: signOutCloud, body: undefined },
  {
    path: 'invite',
    action: () => inviteMember('ada@example.com'),
    body: { email: 'ada@example.com' }
  },
  {
    path: 'invitation/invite%2Fid/cancel',
    action: () => cancelInvitation('invite/id'),
    body: undefined
  },
  { path: 'members/remove', action: () => removeMember('member'), body: { memberId: 'member' } }
])(
  'commands use HTTP status without requiring a response body: $path',
  async ({ path, action, body }) => {
    const fetch = spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }))
    await action()
    expect(fetch).toHaveBeenCalledWith(
      `/cloud/api/auth/${path}`,
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
        body: JSON.stringify(body)
      })
    )
    fetch.mockResolvedValue(Response.json({ message: 'Permission denied' }, { status: 403 }))
    await expect(action()).rejects.toThrow('Permission denied')
  }
)
