import { afterEach, beforeEach, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, stat, utimes } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRemoteClient, resolveRemoteConfig } from './client'

let directory: string
let server: ReturnType<typeof Bun.serve>
let client: ReturnType<typeof createRemoteClient>
let refreshes: number
let requests: number
let revoked: boolean
let responseMode: 'normal' | 'invalid' | 'reject' | 'redirect'
const jwt = (exp: number) =>
  `e30.${Buffer.from(JSON.stringify({ exp })).toString('base64url')}.signature`
const cloudUrl = () => server.url.origin + '/custom/cloud'

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'moi-remote-'))
  refreshes = 0
  requests = 0
  revoked = false
  responseMode = 'normal'
  server = Bun.serve({
    port: 0,
    async fetch(request) {
      requests++
      const path = new URL(request.url).pathname
      expect(path).toStartWith('/custom/cloud/api/')
      if (responseMode === 'invalid') return new Response('{"access_token":"secret-example"')
      if (responseMode === 'reject') return new Response(null, { status: 401 })
      if (responseMode === 'redirect') return Response.redirect(server.url.origin + '/leak')
      if (path.endsWith('/device/code'))
        return Response.json({
          device_code: 'device',
          user_code: 'ABCD',
          verification_uri_complete: cloudUrl() + '/device?user_code=ABCD',
          expires_in: 10,
          interval: 1
        })
      if (path.endsWith('/oauth2/token')) {
        const data = await request.formData()
        expect(data.get('client_id')).toBe('moi-cli')
        if (data.get('grant_type') === 'refresh_token') {
          expect(data.get('refresh_token')).toBe('old-refresh')
          refreshes++
          await Bun.sleep(50) // Other callers arrive while rotation is in progress.
        } else {
          expect(data.get('device_code')).toBe('device')
        }
        return Response.json({
          access_token: jwt(Date.now() / 1000 + 3600),
          refresh_token: 'new-refresh'
        })
      }
      if (path.endsWith('/oauth2/revoke')) {
        expect((await request.formData()).get('token')).toBe('new-refresh')
        revoked = true
        return new Response(null, { status: 200 })
      }
      expect(request.headers.get('authorization')).toStartWith('Bearer ')
      if (path.endsWith('/invitations'))
        return Response.json({
          invitations: [
            {
              id: 'invite-1',
              workspaceId: 'w1',
              workspaceName: 'Project',
              inviter: {
                id: 'u2',
                name: 'Owner',
                email: 'owner@example.com',
                avatar: 'https://example.com/avatar.png'
              },
              expiresAt: '2026-12-01T00:00:00.000Z'
            }
          ]
        })
      if (path.endsWith('/invitations/invite-1/accept')) {
        expect(request.method).toBe('POST')
        expect(request.headers.get('content-type')).toBe('application/json')
        expect(await request.json()).toEqual({})
        return Response.json({ success: true, workspaceId: 'w1', membershipId: 'membership-1' })
      }
      if (path.endsWith('/me'))
        return Response.json({ id: 'u1', name: 'Test', email: 'test@example.com' })
      return Response.json({
        workspaces: [{ id: 'w1', owner: { id: 'u2', name: 'Owner', email: 'owner@example.com' } }]
      })
    }
  })
  client = createRemoteClient(directory)
  await config()
})
afterEach(async () => {
  server.stop(true)
  await rm(directory, { recursive: true, force: true })
})
async function config(overrides: { url?: string; clientId?: string; managed?: boolean } = {}) {
  await Bun.write(
    join(directory, 'config.json'),
    JSON.stringify({ remote: { url: cloudUrl() + '/', ...overrides } })
  )
}
async function credentials(exp = 1) {
  await Bun.write(
    join(directory, 'remote-auth.json'),
    JSON.stringify({
      accessToken: jwt(exp),
      refreshToken: 'old-refresh',
      url: cloudUrl(),
      clientId: 'moi-cli'
    })
  )
}
const stored = () => Bun.file(join(directory, 'remote-auth.json')).json()

test('refreshes once across concurrent reads, saves privately, and revokes on logout', async () => {
  await credentials()
  const results = await Promise.all([client.remoteStatus(), client.remoteStatus()])
  expect(refreshes).toBe(1)
  expect(results[0]?.workspaces[0]?.id).toBe('w1')
  expect((await stat(join(directory, 'remote-auth.json'))).mode & 0o777).toBe(0o600)
  expect(await stored()).toMatchObject({
    refreshToken: 'new-refresh',
    url: cloudUrl(),
    clientId: 'moi-cli'
  })
  await client.logout()
  expect(revoked).toBe(true)
  expect(await Bun.file(join(directory, 'remote-auth.json')).exists()).toBe(false)
})

test('serializes refresh rotation across separate CLI processes', async () => {
  await credentials()
  const code = `import {createRemoteClient} from ${JSON.stringify(new URL('./client.ts', import.meta.url).pathname)}; await createRemoteClient(${JSON.stringify(directory)}).remoteStatus()`
  const children = Array.from({ length: 3 }, () =>
    Bun.spawn([process.execPath, '-e', code], { stdout: 'pipe', stderr: 'pipe' })
  )
  const results = await Promise.all(
    children.map(async child => ({
      code: await child.exited,
      stderr: await new Response(child.stderr).text()
    }))
  )
  expect(results).toEqual(Array.from({ length: 3 }, () => ({ code: 0, stderr: '' })))
  expect(refreshes).toBe(1)
})

test('recovers an abandoned lock before refreshing', async () => {
  await credentials()
  const path = join(directory, 'remote-auth.json.lock')
  await mkdir(path)
  const earlier = new Date(Date.now() - 120_000)
  await utimes(path, earlier, earlier)
  expect((await client.remoteStatus()).me.id).toBe('u1')
  expect(refreshes).toBe(1)
})

test('fresh tokens use no mutation lock and the server helper makes one request', async () => {
  await credentials(Date.now() / 1000 + 3600)
  await mkdir(join(directory, 'remote-auth.json.lock'))
  expect((await client.fetchSharedWorkspaces())[0]?.id).toBe('w1')
  expect(requests).toBe(1)
  expect(refreshes).toBe(0)
})

test('browser approval binds credentials and loads the account', async () => {
  let code = ''
  await client.login((_url, value) => {
    code = value
  })
  expect(code).toBe('ABCD')
  expect(await stored()).toMatchObject({ url: cloudUrl(), clientId: 'moi-cli' })
  expect((await client.remoteStatus()).me.id).toBe('u1')
})

test('managed credentials can refresh but cannot be replaced by login or logout', async () => {
  await config({ managed: true })
  await credentials()
  expect((await client.remoteStatus()).me.id).toBe('u1')
  await expect(client.logout()).rejects.toThrow('Cloud manages sign-in')
  await expect(client.login(() => {})).rejects.toThrow('Cloud manages sign-in')
})

test('changed URL, mount path, or client ID never receives saved credentials', async () => {
  await credentials()
  for (const overrides of [
    { url: 'https://different.example/cloud' },
    { url: server.url.origin + '/other' },
    { clientId: 'another-client' }
  ]) {
    await config(overrides)
    await expect(client.remoteStatus()).rejects.toThrow('different cloud')
    await expect(client.logout()).rejects.toThrow('different cloud')
  }
  expect(requests).toBe(0)
})

test('legacy credentials without an environment binding require sign-in', async () => {
  await Bun.write(
    join(directory, 'remote-auth.json'),
    JSON.stringify({ accessToken: jwt(1), refreshToken: 'secret-example' })
  )
  await expect(client.remoteStatus()).rejects.toThrow('Invalid remote credentials')
  expect(requests).toBe(0)
})

test('invalid token responses do not expose secrets or replace saved credentials', async () => {
  await credentials()
  const before = await stored()
  responseMode = 'invalid'
  await expect(client.remoteStatus()).rejects.toThrow('Cloud returned an invalid response')
  expect(await stored()).toEqual(before)
})

test('redirects are not followed with credentials', async () => {
  await credentials(Date.now() / 1000 + 3600)
  responseMode = 'redirect'
  await expect(client.fetchSharedWorkspaces()).rejects.toThrow()
  expect(requests).toBe(1)
})

test('failed logout keeps credentials so revocation can be retried', async () => {
  await credentials()
  responseMode = 'reject'
  await expect(client.logout()).rejects.toThrow('credentials kept')
  expect((await stored()).refreshToken).toBe('old-refresh')
})

test('development requires a target; published installs default to production', () => {
  expect(() => resolveRemoteConfig({}, true)).toThrow('For development, configure the Cloud URL')
  expect(resolveRemoteConfig({}, false).url).toBe('https://run.moi.computer/cloud')
  expect(resolveRemoteConfig({ url: 'http://localhost:8787/custom/cloud/' }, true).url).toBe(
    'http://localhost:8787/custom/cloud'
  )
  for (const url of [
    'http://remote.example/cloud',
    'file:///cloud',
    'https://u:secret@example.com/cloud',
    'https://example.com/cloud?token=secret'
  ]) {
    expect(() => resolveRemoteConfig({ url }, true)).toThrow()
  }
})

test('invitation helpers refresh managed credentials and preserve inviter metadata', async () => {
  await config({ managed: true })
  await credentials()
  const invitations = await client.fetchInvitations()
  expect(invitations).toHaveLength(1)
  expect(invitations[0]).toMatchObject({
    id: 'invite-1',
    workspaceName: 'Project',
    inviter: { avatar: 'https://example.com/avatar.png' }
  })
  expect(await client.acceptInvitation(invitations[0]!.id)).toEqual({
    success: true,
    workspaceId: 'w1',
    membershipId: 'membership-1'
  })
  expect(refreshes).toBe(1)
})

test('accept rejects path injection locally and does not follow cloud redirects', async () => {
  await credentials(Date.now() / 1000 + 3600)
  await expect(client.acceptInvitation('../other')).rejects.toThrow('Invalid invitation ID')
  expect(requests).toBe(0)
  responseMode = 'redirect'
  await expect(client.acceptInvitation('invite-1')).rejects.toThrow()
  expect(requests).toBe(1)
})
