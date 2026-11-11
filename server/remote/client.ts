import { decodeJwt } from 'jose'
import { Mutex } from 'async-mutex'
import { lock } from 'proper-lockfile'
import { z } from 'zod'
import { chmod, mkdir, rename, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { DATA_DIR } from '../data-dir'
import { PACKAGE_ROOT } from '../version'

const credentialsSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  url: z.string().min(1),
  clientId: z.string().min(1)
})
type Credentials = z.infer<typeof credentialsSchema>
const tokensSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1)
})
const deviceSchema = z.object({
  device_code: z.string().min(1),
  user_code: z.string().min(1),
  verification_uri_complete: z.url(),
  expires_in: z.number().positive().max(3600),
  interval: z.number().positive().max(60).default(5)
})
const profileSchema = z
  .object({ id: z.string(), name: z.string(), email: z.string() })
  .passthrough()
const workspacesSchema = z.object({
  workspaces: z.array(z.object({ id: z.string(), owner: profileSchema }))
})
const invitationSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  workspaceName: z.string(),
  inviter: profileSchema,
  expiresAt: z.iso.datetime()
})
const invitationsSchema = z.object({ invitations: z.array(invitationSchema) })
const acceptanceSchema = z.object({
  success: z.literal(true),
  workspaceId: z.string(),
  membershipId: z.string()
})
const remoteSchema = z.object({
  url: z.string().min(1).optional(),
  clientId: z.string().min(1).optional(),
  managed: z.boolean().optional()
})
const configSchema = z.object({ remote: remoteSchema.optional() })
type RemoteConfig = { url: string; clientId: string; managed: boolean }
export type Profile = { id: string; name: string; email: string }
export type SharedWorkspace = { id: string; owner: Profile }
export type RemoteInvitation = z.infer<typeof invitationSchema>
export type AcceptedInvitation = z.infer<typeof acceptanceSchema>
export type RemoteStatus = { me: Profile; workspaces: SharedWorkspace[] }
export function resolveRemoteConfig(
  remote: { url?: string; clientId?: string; managed?: boolean },
  development: boolean,
  directory = DATA_DIR
): RemoteConfig {
  if (development && !remote.url) {
    throw new Error(
      `For development, configure the Cloud URL to point to your local cloud dev server.\nSet remote.url in ${join(directory, 'config.json')}\nFor example, http://localhost:8787/cloud`
    )
  }
  const url = new URL(remote.url ?? 'https://run.moi.computer/cloud')
  if (
    url.protocol !== 'https:' &&
    !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
  ) {
    throw new Error('Remote URL must use HTTPS (HTTP is allowed for localhost)')
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('Cloud URL must not contain credentials, a query, or a fragment')
  }
  return {
    url: url.href.replace(/\/+$/, ''),
    clientId: remote.clientId ?? 'moi-cli',
    managed: remote.managed === true
  }
}

/** Each client owns one data directory. Tests use an isolated directory. */
export function createRemoteClient(directory: string) {
  const authFile = join(directory, 'remote-auth.json')
  const mutex = new Mutex()

  async function json<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
    // A parser error can quote the response body, which may contain tokens.
    const parsed = schema.safeParse(await response.json().catch(() => undefined))
    if (!parsed.success) throw new Error('Cloud returned an invalid response')
    return parsed.data
  }

  async function remoteConfig(): Promise<RemoteConfig> {
    let raw: unknown = {}
    try {
      raw = await Bun.file(join(directory, 'config.json')).json()
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        throw new Error('Could not read Moi config.json')
    }
    const parsed = configSchema.safeParse(raw)
    if (!parsed.success) throw new Error('Invalid remote settings in config.json')
    const development =
      process.env.NODE_ENV === 'development' || existsSync(join(PACKAGE_ROOT, '.git'))
    return resolveRemoteConfig(parsed.data.remote ?? {}, development, directory)
  }

  async function post(config: RemoteConfig, path: string, values: Record<string, string>) {
    return fetch(`${config.url}/api/auth${path}`, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: config.clientId, ...values })
    })
  }

  async function read(config: RemoteConfig): Promise<Credentials> {
    let value: unknown
    try {
      value = await Bun.file(authFile).json()
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        throw new Error('Not signed in — run moi remote login')
      throw new Error('Could not read remote credentials — run moi remote login')
    }
    const parsed = credentialsSchema.safeParse(value)
    if (!parsed.success) throw new Error('Invalid remote credentials — run moi remote login')
    if (parsed.data.url !== config.url || parsed.data.clientId !== config.clientId) {
      throw new Error(
        'Saved login belongs to a different cloud — restore the previous Cloud URL or run moi remote login'
      )
    }
    return parsed.data
  }

  async function save(
    response: Response,
    config: RemoteConfig,
    assertLock: () => void
  ): Promise<Credentials> {
    if (!response.ok)
      throw new Error(`Could not refresh login (${response.status}) — run moi remote login`)
    const value = await json(response, tokensSchema)
    const pair = {
      accessToken: value.access_token,
      refreshToken: value.refresh_token,
      url: config.url,
      clientId: config.clientId
    }
    const temporary = `${authFile}.${crypto.randomUUID()}.tmp`
    try {
      await Bun.write(temporary, JSON.stringify(pair) + '\n', { mode: 0o600 })
      await chmod(temporary, 0o600)
      assertLock()
      await rename(temporary, authFile)
    } finally {
      await rm(temporary, { force: true })
    }
    return pair
  }

  // Only mutations take a cross-process lock. Heartbeats let later commands
  // recover a lock abandoned by a crash; the in-process mutex avoids retry delays.
  async function locked<T>(action: (assertLock: () => void) => Promise<T>): Promise<T> {
    return mutex.runExclusive(async () => {
      await mkdir(directory, { recursive: true, mode: 0o700 })
      let compromised: Error | undefined
      const release = await lock(directory, {
        lockfilePath: `${authFile}.lock`,
        stale: 60_000,
        update: 10_000,
        retries: { retries: 80, factor: 1.5, minTimeout: 50, maxTimeout: 1000 },
        onCompromised: error => {
          compromised = error
        }
      })
      const assertLock = () => {
        if (compromised) throw new Error('Remote credentials lock was lost — retry the command')
      }
      try {
        return await action(assertLock)
      } finally {
        if (!compromised) await release()
      }
    })
  }

  async function login(
    announce: (url: string, code: string) => void | Promise<void>
  ): Promise<void> {
    const config = await remoteConfig()
    if (config.managed) throw new Error('Cloud manages sign-in on this machine')
    const response = await post(config, '/device/code', {
      scope: 'profile:read workspaces:read workspaces:access offline_access',
      resource: 'urn:moi:cloud'
    })
    if (!response.ok) throw new Error(`Could not start login (${response.status})`)
    const device = await json(response, deviceSchema)
    const verification = new URL(device.verification_uri_complete)
    if (
      verification.origin !== new URL(config.url).origin ||
      verification.username ||
      verification.password
    )
      throw new Error('Cloud returned a login URL on a different origin')
    await announce(verification.href, device.user_code)
    let interval = device.interval
    const deadline = Date.now() + device.expires_in * 1000
    while (Date.now() < deadline) {
      await Bun.sleep(interval * 1000)
      if (Date.now() >= deadline) break
      const token = await post(config, '/oauth2/token', {
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        device_code: device.device_code
      })
      if (token.ok) {
        await locked(assertLock => save(token, config, assertLock))
        return
      }
      if (token.status === 429) {
        interval = Math.min(
          60,
          Math.max(interval + 5, Number(token.headers.get('retry-after')) || 0)
        )
        continue
      }
      const result = await json(token, z.object({ error: z.string() }))
      if (result.error === 'slow_down') interval = Math.min(60, interval + 5)
      else if (result.error !== 'authorization_pending')
        throw new Error(`Login failed (${token.status}) — run moi remote login again`)
    }
    throw new Error('Login expired — run moi remote login again')
  }

  async function logout(): Promise<void> {
    const config = await remoteConfig()
    if (config.managed) throw new Error('Cloud manages sign-in on this machine')
    await locked(async assertLock => {
      if (!(await Bun.file(authFile).exists())) return
      const pair = await read(config)
      const response = await post(config, '/oauth2/revoke', {
        token_type_hint: 'refresh_token',
        token: pair.refreshToken
      })
      if (!response.ok)
        throw new Error(`Logout failed (${response.status}); credentials kept so you can retry`)
      assertLock()
      await rm(authFile, { force: true })
    })
  }

  function fresh(pair: Credentials): boolean {
    try {
      return (decodeJwt(pair.accessToken).exp ?? 0) * 1000 > Date.now() + 30_000
    } catch {
      return false
    }
  }

  async function access(config: RemoteConfig): Promise<Credentials> {
    const pair = await read(config)
    if (fresh(pair)) return pair
    return locked(async assertLock => {
      const current = await read(config)
      if (fresh(current)) return current
      return save(
        await post(config, '/oauth2/token', {
          grant_type: 'refresh_token',
          refresh_token: current.refreshToken
        }),
        config,
        assertLock
      )
    })
  }

  async function authenticatedRequest<T>(
    config: RemoteConfig,
    pair: Credentials,
    path: string,
    schema: z.ZodType<T>,
    method: 'GET' | 'POST' = 'GET'
  ): Promise<T> {
    const response = await fetch(`${config.url}/api${path}`, {
      method,
      headers: {
        authorization: `Bearer ${pair.accessToken}`,
        ...(method === 'POST' ? { 'content-type': 'application/json' } : {})
      },
      body: method === 'POST' ? '{}' : undefined,
      redirect: 'error',
      signal: AbortSignal.timeout(30_000)
    })
    if (response.status === 401) throw new Error('Sign-in expired — run moi remote login')
    if (!response.ok) throw new Error(`Cloud request failed (${response.status})`)
    return json(response, schema)
  }

  /** Read accepted shared workspaces using this machine's configured cloud login.
   * Refreshes credentials automatically; requires no browser or running Moi server.
   */
  async function fetchSharedWorkspaces(): Promise<SharedWorkspace[]> {
    const config = await remoteConfig()
    const pair = await access(config)
    const result = await authenticatedRequest(config, pair, '/workspaces/shared', workspacesSchema)
    return result.workspaces
  }

  /** Pending invitations addressed to the signed-in user's verified email. */
  async function fetchInvitations(): Promise<RemoteInvitation[]> {
    const config = await remoteConfig()
    const pair = await access(config)
    return (await authenticatedRequest(config, pair, '/invitations', invitationsSchema)).invitations
  }

  /** Accept an invitation returned by fetchInvitations; no email-link token needed. */
  async function acceptInvitation(id: string): Promise<AcceptedInvitation> {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new Error('Invalid invitation ID')
    const config = await remoteConfig()
    const pair = await access(config)
    return authenticatedRequest(config, pair, `/invitations/${id}/accept`, acceptanceSchema, 'POST')
  }

  async function remoteStatus(): Promise<RemoteStatus> {
    const config = await remoteConfig()
    const pair = await access(config)
    const [me, shared] = await Promise.all([
      authenticatedRequest(config, pair, '/me', profileSchema),
      authenticatedRequest(config, pair, '/workspaces/shared', workspacesSchema)
    ])
    return { me, workspaces: shared.workspaces }
  }

  return {
    remoteConfig,
    login,
    logout,
    fetchSharedWorkspaces,
    fetchInvitations,
    acceptInvitation,
    remoteStatus
  }
}

export const {
  remoteConfig,
  login,
  logout,
  fetchSharedWorkspaces,
  fetchInvitations,
  acceptInvitation,
  remoteStatus
} = createRemoteClient(DATA_DIR)
