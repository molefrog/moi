import { colorForId } from '@/lib/collab/colors'
import { isCollabIdentity, isRecord } from '@/lib/collab/protocol'
import type { CollabIdentity, ProxyIdentity } from '@/lib/collab/types'

import { type CloudflareAccessConfig, getAppConfig } from '../app-config'

// Cloudflare Access adds a signed application token (an RS256 JWT) to every
// request it lets through. Only the verified signature, issuer, and audience
// make the identity trustworthy: anyone who reaches the origin some other way
// can send the header too.
// https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/
export const ACCESS_TOKEN_HEADER = 'cf-access-jwt-assertion'
// Browsers hold the same application token in this cookie on the app's domain.
export const ACCESS_TOKEN_COOKIE = 'CF_Authorization'

const RS256 = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }
// Signing keys rotate every six weeks. An unknown key id refetches the set, at
// most once a minute, so forged key ids cannot hammer the team domain. Known
// keys expire too, so a key Cloudflare stops publishing stops verifying.
const KEY_REFRESH_INTERVAL_MS = 60_000
const KEY_MAX_AGE_MS = 10 * 60_000
const KEY_FETCH_TIMEOUT_MS = 5_000
// Tolerated clock drift between Cloudflare and this machine.
const CLOCK_SKEW_SECONDS = 60

export type AccessUser = { id: string; email: string }

type VerifierOptions = {
  fetch?: (url: string, init: RequestInit) => Promise<Response>
  now?: () => number
}

function decodeSegment(segment: string): Uint8Array<ArrayBuffer> | null {
  return /^[\w-]+$/.test(segment) ? new Uint8Array(Buffer.from(segment, 'base64url')) : null
}

function decodeJson(segment: string): unknown {
  const bytes = decodeSegment(segment)
  try {
    return bytes ? JSON.parse(new TextDecoder().decode(bytes)) : null
  } catch {
    return null
  }
}

export class CloudflareAccessVerifier {
  private keys = new Map<string, CryptoKey>()
  private refreshedAt = -Infinity
  private refreshing: Promise<void> | null = null

  constructor(
    private config: CloudflareAccessConfig,
    private options: VerifierOptions = {}
  ) {}

  // The Access user a token was issued to, or null for anything that is not a
  // valid user token for this application. Service tokens carry no user.
  async verify(token: string): Promise<AccessUser | null> {
    const [header, payload, signature, ...rest] = token.split('.')
    if (!header || !payload || !signature || rest.length) return null
    const protectedHeader = decodeJson(header)
    const claims = decodeJson(payload)
    const signatureBytes = decodeSegment(signature)
    if (!isRecord(protectedHeader) || !isRecord(claims) || !signatureBytes) return null
    if (protectedHeader.alg !== 'RS256' || typeof protectedHeader.kid !== 'string') return null
    const key = await this.key(protectedHeader.kid)
    if (!key) return null
    const signed = new TextEncoder().encode(`${header}.${payload}`)
    if (!(await crypto.subtle.verify(RS256, key, signatureBytes, signed))) return null
    return this.user(claims)
  }

  private user(claims: Record<string, unknown>): AccessUser | null {
    const now = Math.floor(this.now() / 1000)
    const audience: unknown[] = Array.isArray(claims.aud) ? claims.aud : [claims.aud]
    if (claims.iss !== this.config.teamDomain) return null
    if (!audience.some(tag => typeof tag === 'string' && this.config.audience.includes(tag)))
      return null
    if (typeof claims.exp !== 'number' || claims.exp + CLOCK_SKEW_SECONDS < now) return null
    if (typeof claims.nbf === 'number' && claims.nbf - CLOCK_SKEW_SECONDS > now) return null
    if (typeof claims.sub !== 'string' || !claims.sub) return null
    if (typeof claims.email !== 'string' || !claims.email) return null
    return { id: claims.sub, email: claims.email }
  }

  private now(): number {
    return this.options.now?.() ?? Date.now()
  }

  private async key(kid: string): Promise<CryptoKey | null> {
    const age = this.now() - this.refreshedAt
    const stale = age >= KEY_MAX_AGE_MS || (!this.keys.has(kid) && age >= KEY_REFRESH_INTERVAL_MS)
    if (stale && !this.refreshing) {
      this.refreshing = this.refresh().finally(() => {
        this.refreshing = null
      })
    }
    await this.refreshing
    return this.keys.get(kid) ?? null
  }

  private async refresh(): Promise<void> {
    this.refreshedAt = this.now()
    const url = `${this.config.teamDomain}/cdn-cgi/access/certs`
    try {
      const response = await (this.options.fetch ?? fetch)(url, {
        signal: AbortSignal.timeout(KEY_FETCH_TIMEOUT_MS)
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const body: unknown = await response.json()
      const keys = new Map<string, CryptoKey>()
      for (const jwk of isRecord(body) && Array.isArray(body.keys) ? body.keys : []) {
        if (!isRecord(jwk) || jwk.kty !== 'RSA' || typeof jwk.kid !== 'string') continue
        if (typeof jwk.n !== 'string' || typeof jwk.e !== 'string') continue
        try {
          const publicKey = { kty: 'RSA', n: jwk.n, e: jwk.e }
          keys.set(
            jwk.kid,
            await crypto.subtle.importKey('jwk', publicKey, RS256, false, ['verify'])
          )
        } catch {}
      }
      if (!keys.size) throw new Error('no RSA signing keys in the response')
      // Keys missing from a fresh set were revoked; a failed fetch keeps the old set.
      this.keys = keys
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      console.error(`[moi] Cloudflare Access: could not load signing keys from ${url}: ${reason}`)
    }
  }
}

// Access tokens carry an id and an email but no display name, so the profile
// has none and labels fall back to the email. The color is a stable pick from the id.
export function accessProfile({ id, email }: AccessUser): CollabIdentity | null {
  const profile: CollabIdentity = { id, color: colorForId(id), email }
  return isCollabIdentity(profile) ? profile : null
}

// The verifier and its key cache live as long as the resolved config object.
let current: { config: CloudflareAccessConfig; verifier: CloudflareAccessVerifier } | null = null

// Who the configured proxy says sent this request. Without Cloudflare Access
// configured, moi trusts no proxy and every request resolves to no provider.
export async function proxyIdentity(req: Request): Promise<ProxyIdentity> {
  const config = getAppConfig().cloudflareAccess
  if (!config) return { provider: null, identity: null }
  if (current?.config !== config)
    current = { config, verifier: new CloudflareAccessVerifier(config) }
  // The header Access adds wins; the cookie covers proxies that drop it.
  const token =
    req.headers.get(ACCESS_TOKEN_HEADER) ??
    new Bun.CookieMap(req.headers.get('cookie') ?? '').get(ACCESS_TOKEN_COOKIE)
  const user = token ? await current.verifier.verify(token) : null
  return { provider: 'cloudflare-access', identity: user ? accessProfile(user) : null }
}
