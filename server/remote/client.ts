import { workspaceAddress, workspaceApiBase } from '@/lib/workspace-config'
import { decodeJwt } from 'jose'
import { Mutex } from 'async-mutex'
import { lock } from 'proper-lockfile'
import { z } from 'zod'
import { chmod, mkdir, rename, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { DATA_DIR } from '../data-dir'
import { PACKAGE_ROOT } from '../version'
import { agentCredentialsSchema, agentAuthorization, agentJoinBody, createAgentKeys } from './agent'

type RemoteRequestOptions = {
  method?: string
  body?: string | Blob | Uint8Array<ArrayBuffer>
  signal?: AbortSignal
  contentType?: string
}

export class CloudSignInRequired extends Error {}

const humanCredentialsSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  url: z.string().min(1),
  clientId: z.string().min(1)
})
const credentialsSchema = z.union([agentCredentialsSchema, humanCredentialsSchema])
type Credentials = z.infer<typeof credentialsSchema>
const isAgent = (value: Credentials): value is z.infer<typeof agentCredentialsSchema> =>
  'kind' in value && value.kind === 'agent'
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
const humanProfileSchema = z
  .object({ id: z.string(), name: z.string(), email: z.string() })
  .passthrough()
const agentProfileSchema = z.object({
  id: z.string(),
  type: z.literal('agent'),
  name: z.string(),
  client: z.string()
})
const profileSchema = z.union([agentProfileSchema, humanProfileSchema])
const workspacesSchema = z.object({
  workspaces: z.array(z.object({ id: z.string(), owner: humanProfileSchema }))
})
const remoteSchema = z.object({
  url: z.string().min(1).optional(),
  clientId: z.string().min(1).optional(),
  managed: z.boolean().optional()
})
const configSchema = z.object({ remote: remoteSchema.optional() })
type RemoteConfig = { url: string; clientId: string; managed: boolean }
export type Profile = z.infer<typeof profileSchema>
export type SharedWorkspace = { id: string; owner: z.infer<typeof humanProfileSchema> }
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
  const pendingFile = join(directory, 'remote-agent-pending.json')

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
        throw new CloudSignInRequired('Sign in with moi remote login to see shared workspaces')
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

  async function writePrivate(path: string, value: unknown, assertLock: () => void) {
    const temporary = `${path}.${crypto.randomUUID()}.tmp`
    try {
      await Bun.write(temporary, JSON.stringify(value) + '\n', { mode: 0o600 })
      await chmod(temporary, 0o600)
      assertLock()
      await rename(temporary, path)
    } finally {
      await rm(temporary, { force: true })
    }
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
    await writePrivate(authFile, pair, assertLock)
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
    if ((await Bun.file(authFile).exists()) && isAgent(await read(config)))
      throw new Error('Signed in as an agent — use a separate Moi data directory for human login')
    if (await Bun.file(pendingFile).exists())
      throw new Error('An agent join is pending — retry that invitation first')
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
        await locked(async assertLock => {
          if ((await Bun.file(authFile).exists()) && isAgent(await read(config)))
            throw new Error(
              'An agent signed in while browser login was pending; agent credentials kept'
            )
          if (await Bun.file(pendingFile).exists())
            throw new Error('An agent join is pending; its keys were kept')
          return save(token, config, assertLock)
        })
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

  async function logout(confirmed = false): Promise<void> {
    const config = await remoteConfig()
    if (config.managed) throw new Error('Cloud manages sign-in on this machine')
    await locked(async assertLock => {
      if (!(await Bun.file(authFile).exists())) {
        if (await Bun.file(pendingFile).exists())
          throw new Error(
            'An agent join is unfinished — retry the same invitation before logging out'
          )
        return
      }
      const pair = await read(config)
      if (isAgent(pair)) {
        if (!confirmed)
          throw new Error(
            'Logging out permanently revokes this agent login and deletes its local keys. It cannot be restored. Run moi remote logout --yes to confirm'
          )
        await cloudJson(config, pair, '/agents/logout', {}, z.object({ success: z.boolean() }))
        assertLock()
        await rm(authFile, { force: true })
        await rm(pendingFile, { force: true })
        return
      }
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

  function fresh(pair: z.infer<typeof humanCredentialsSchema>): boolean {
    try {
      return (decodeJwt(pair.accessToken).exp ?? 0) * 1000 > Date.now() + 30_000
    } catch {
      return false
    }
  }

  async function access(config: RemoteConfig): Promise<Credentials> {
    const pair = await read(config)
    if (isAgent(pair) || fresh(pair)) return pair
    return locked(async assertLock => {
      const current = await read(config)
      if (isAgent(current) || fresh(current)) return current
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

  async function cloudJson<T>(
    config: RemoteConfig,
    pair: Credentials,
    path: string,
    body: unknown | undefined,
    schema: z.ZodType<T>,
    method = body === undefined ? 'GET' : 'POST'
  ): Promise<T> {
    if (!path.startsWith('/') || path.startsWith('//') || path.includes('..'))
      throw new Error('Invalid cloud API path')
    const url = `${config.url}/api${path}`,
      raw = body === undefined ? '' : JSON.stringify(body)
    const authorization = isAgent(pair)
      ? await agentAuthorization(pair, url, method, raw)
      : `Bearer ${pair.accessToken}`
    const response = await fetch(url, {
      method,
      headers: { authorization, 'content-type': 'application/json' },
      body: body === undefined ? undefined : raw,
      redirect: 'error',
      signal: AbortSignal.timeout(30_000)
    })
    if (response.status === 401)
      throw new Error(
        isAgent(pair) ? 'Agent login is no longer valid' : 'Sign-in expired — run moi remote login'
      )
    if (!response.ok) throw new Error(`Cloud request failed (${response.status})`)
    return json(response, schema)
  }
  async function request<T>(
    path: string,
    body: unknown | undefined,
    schema: z.ZodType<T>,
    method?: string
  ) {
    const config = await remoteConfig()
    return cloudJson(config, await access(config), path, body, schema, method)
  }
  async function authenticatedGet<T>(
    config: RemoteConfig,
    pair: Credentials,
    path: string,
    schema: z.ZodType<T>
  ) {
    return cloudJson(config, pair, path, undefined, schema)
  }
  const invitationSchema = z.object({
    id: z.string(),
    workspaceId: z.string(),
    workspaceName: z.string(),
    inviter: humanProfileSchema,
    expiresAt: z.string()
  })
  async function invitations() {
    return (
      await request(
        '/workspaces/invitations',
        undefined,
        z.object({ invitations: z.array(invitationSchema) })
      )
    ).invitations
  }
  function invitation(value: string, config: RemoteConfig) {
    if (!value.includes('://')) {
      if (!/^[A-Za-z0-9_-]{1,240}$/.test(value)) throw new Error('Invalid invitation ID')
      return { id: value, token: undefined }
    }
    const url = new URL(value)
    const root = new URL(config.url)
    const prefix = root.pathname.replace(/\/$/, '')
    const match = new RegExp(
      `^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/(?:agent-invite|invite)/([A-Za-z0-9_-]{1,240})$`
    ).exec(url.pathname)
    const token = url.searchParams.get('token')
    if (
      url.origin !== root.origin ||
      url.username ||
      url.password ||
      !match ||
      !token ||
      !/^[A-Za-z0-9_-]{43}$/.test(token)
    )
      throw new Error('Use an invitation URL from your configured Cloud URL')
    return { id: match[1]!, token }
  }
  const accepted = z.object({
    success: z.literal(true),
    workspaceId: z.string(),
    membershipId: z.string()
  })
  async function accept(value: string) {
    const config = await remoteConfig(),
      target = invitation(value, config)
    const pair = await access(config)
    if (isAgent(pair))
      throw new Error('Signed in as an agent — use moi remote join for agent invitations')
    return cloudJson(
      config,
      pair,
      `/invitations/${encodeURIComponent(target.id)}/accept`,
      target.token ? { token: target.token } : {},
      accepted
    )
  }
  async function joinAgent(value: string, name?: string, client?: string) {
    const config = await remoteConfig()
    if (config.managed) throw new Error('Cloud manages sign-in on this machine')
    const target = invitation(value, config)
    return locked(async assertLock => {
      if (await Bun.file(authFile).exists()) {
        const pair = await read(config)
        if (!isAgent(pair))
          throw new Error(
            'Already signed in as a human — use a separate Moi data directory for this agent'
          )
        return cloudJson(
          config,
          pair,
          `/invitations/${encodeURIComponent(target.id)}/accept`,
          target.token ? { token: target.token } : {},
          accepted
        )
      }
      if (!target.token) throw new Error('First agent join requires an invitation URL')
      const fingerprint = new Bun.CryptoHasher('sha256').update(target.token).digest('hex')
      const pendingSchema = z.object({
        fingerprint: z.string(),
        name: z.string(),
        client: z.string(),
        keys: agentCredentialsSchema
      })
      let pending: z.infer<typeof pendingSchema>
      if (await Bun.file(pendingFile).exists()) {
        const saved = pendingSchema.safeParse(
          await Bun.file(pendingFile)
            .json()
            .catch(() => undefined)
        )
        if (!saved.success)
          throw new Error('Could not read pending agent keys; credentials were kept')
        pending = saved.data
        if (
          pending.fingerprint !== fingerprint ||
          pending.keys.url !== config.url ||
          pending.keys.clientId !== config.clientId
        )
          throw new Error(
            'Retry the original pending agent invitation before switching accounts or clouds'
          )
      } else {
        if (
          !name?.trim() ||
          name.trim().length > 80 ||
          !client?.trim() ||
          client.trim().length > 200 ||
          !/[a-z0-9]/i.test(client)
        )
          throw new Error('First agent join requires --name and --client')
        pending = {
          fingerprint,
          name: name.trim(),
          client: client.trim(),
          keys: await createAgentKeys(config)
        }
        await writePrivate(pendingFile, pending, assertLock)
      }
      const body = await agentJoinBody(pending.keys, target.token, pending.name, pending.client)
      const response = await fetch(`${config.url}/api/agents/join`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        redirect: 'error',
        signal: AbortSignal.timeout(30_000)
      })
      if (!response.ok)
        throw new Error(
          `Agent join failed (${response.status}); keys kept so you can retry the same invitation`
        )
      const joined = await json(
        response,
        accepted.extend({ agentId: z.string(), hostId: z.string() })
      )
      if (joined.agentId !== pending.keys.agentId || joined.hostId !== pending.keys.hostId)
        throw new Error('Cloud returned an unexpected agent identity')
      await writePrivate(authFile, pending.keys, assertLock)
      await rm(pendingFile, { force: true })
      return joined
    })
  }
  async function renameAgent(name: string) {
    const config = await remoteConfig(),
      pair = await access(config)
    if (!isAgent(pair)) throw new Error('This command is for agents')
    return cloudJson(config, pair, '/me', { name }, agentProfileSchema, 'PATCH')
  }
  async function leave(ownerId: string, workspaceId: string) {
    return request(
      `/workspaces/${workspaceAddress(workspaceId, ownerId)}/leave`,
      {},
      z.object({ success: z.literal(true) })
    )
  }

  /** Read accepted shared workspaces using this machine's configured cloud login.
   * Refreshes credentials automatically; requires no browser or running Moi server.
   */
  async function fetchSharedWorkspaces(): Promise<SharedWorkspace[]> {
    const config = await remoteConfig()
    const pair = await access(config)
    const result = await authenticatedGet(config, pair, '/workspaces/shared', workspacesSchema)
    return result.workspaces
  }

  /** Byte-preserving operations transport; writes are never automatically replayed. */
  async function operation(
    ownerId: string,
    workspaceId: string,
    suffix: string,
    options: RemoteRequestOptions = {}
  ): Promise<Response> {
    if (
      ![ownerId, workspaceId].every(id => /^[A-Za-z0-9_-]+$/.test(id)) ||
      !/^\/(?:files\/|exec$|commands$)/.test(suffix)
    )
      throw new Error('Invalid remote operation')
    return authenticatedTransport(
      `api/workspaces/${workspaceAddress(workspaceId, ownerId)}/ops${suffix}`,
      options
    )
  }

  async function workspaceRequest(
    ownerId: string,
    workspaceId: string,
    suffix: string,
    options: RemoteRequestOptions = {}
  ) {
    const base = new URL(workspaceApiBase(workspaceId, ownerId), 'http://workspace.local')
    const url = new URL(base.href + suffix)
    if (
      url.origin !== base.origin ||
      (url.pathname !== base.pathname && !url.pathname.startsWith(base.pathname + '/'))
    )
      throw new Error('Invalid workspace path')
    return authenticatedTransport(url.pathname + url.search, options)
  }

  async function authenticatedTransport(path: string, options: RemoteRequestOptions) {
    const config = await remoteConfig()
    const pair = await access(config)
    const url = new URL(path, config.url.replace(/\/+$/, '') + '/').href
    const method = options.method ?? 'GET'
    let body = options.body
    if (isAgent(pair) && body instanceof Blob) {
      if (body.size > 16 * 1024 * 1024) throw new Error('Agent uploads are limited to 16 MiB')
      body = new Uint8Array(await body.arrayBuffer())
    }
    if (
      isAgent(pair) &&
      body &&
      (typeof body === 'string'
        ? Buffer.byteLength(body)
        : body instanceof Blob
          ? body.size
          : body.byteLength) >
        16 * 1024 * 1024
    )
      throw new Error('Agent uploads are limited to 16 MiB')
    const authorization = isAgent(pair)
      ? await agentAuthorization(pair, url, method, body instanceof Blob ? '' : (body ?? ''))
      : `Bearer ${pair.accessToken}`
    const response = await fetch(url, {
      method,
      body,
      redirect: 'error',
      signal: options.signal,
      headers: {
        authorization,
        ...(options.contentType ? { 'content-type': options.contentType } : {})
      }
    })
    if (!response.ok) {
      await response.body?.cancel()
      throw new Error(
        response.status === 401
          ? 'Cloud login expired or revoked — run moi remote login'
          : `Remote operation failed (${response.status})`
      )
    }
    return response
  }

  async function remoteStatus(): Promise<RemoteStatus> {
    const config = await remoteConfig()
    const pair = await access(config)
    const [me, shared] = await Promise.all([
      authenticatedGet(config, pair, '/me', profileSchema),
      authenticatedGet(config, pair, '/workspaces/shared', workspacesSchema)
    ])
    return { me, workspaces: shared.workspaces }
  }

  return {
    remoteConfig,
    login,
    logout,
    fetchSharedWorkspaces,
    workspaceRequest,
    remoteStatus,
    operation,
    invitations,
    accept,
    joinAgent,
    renameAgent,
    leave
  }
}

export const {
  remoteConfig,
  login,
  logout,
  fetchSharedWorkspaces,
  workspaceRequest,
  remoteStatus,
  operation,
  invitations,
  accept,
  joinAgent,
  renameAgent,
  leave
} = createRemoteClient(DATA_DIR)
