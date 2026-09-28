import { createRemoteJWKSet, customFetch, errors, jwtVerify } from 'jose'
import type { FetchImplementation } from 'jose'

import { colorForId } from '@/lib/collab/colors'
import { isUserProfile } from '@/lib/collab/protocol'
import type { ProxyIdentity, UserProfile } from '@/lib/collab/types'

import { type CloudflareAccessConfig, getAppConfig } from '../app-config'

// Cloudflare Access adds a signed application token (an RS256 JWT) to every
// request it lets through. Only the verified signature, issuer, and audience
// make the identity trustworthy: anyone who reaches the origin some other way
// can send the header too.
// https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/
export const ACCESS_TOKEN_HEADER = 'cf-access-jwt-assertion'
// Browsers hold the same application token in this cookie on the app's domain.
export const ACCESS_TOKEN_COOKIE = 'CF_Authorization'

// Failing to load the team's keys is a setup problem worth logging; a bad
// token is expected noise.
const KEY_ERRORS = new Set(['ERR_JOSE_GENERIC', 'ERR_JWKS_INVALID', 'ERR_JWKS_TIMEOUT'])

export type AccessUser = { id: string; email: string }
export type AccessVerifier = (token: string) => Promise<AccessUser | null>

// jose caches the team's signing keys for ten minutes and refetches them for
// an unknown key id at most every 30 seconds, which covers key rotation.
export function accessVerifier(
  config: CloudflareAccessConfig,
  fetch?: FetchImplementation
): AccessVerifier {
  const url = new URL('/cdn-cgi/access/certs', config.teamDomain)
  const keys = createRemoteJWKSet(url, fetch ? { [customFetch]: fetch } : {})
  return async token => {
    try {
      const { payload } = await jwtVerify(token, keys, {
        issuer: config.teamDomain,
        audience: [...config.audience],
        algorithms: ['RS256'],
        requiredClaims: ['exp'],
        clockTolerance: 60
      })
      // Service tokens have an empty `sub` and no email: there is no person.
      const { sub, email } = payload
      return sub && typeof email === 'string' && email ? { id: sub, email } : null
    } catch (error) {
      if (!(error instanceof errors.JOSEError) || KEY_ERRORS.has(error.code)) {
        console.error(`[moi] Cloudflare Access: could not load signing keys from ${url}: ${error}`)
      }
      return null
    }
  }
}

// Access tokens carry an id and an email but no display name, so the profile
// has none and labels fall back to the email. The color is a stable pick from the id.
export function accessProfile({ id, email }: AccessUser): UserProfile | null {
  const profile: UserProfile = { id, color: colorForId(id), email }
  return isUserProfile(profile) ? profile : null
}

// The verifier and its key cache live as long as the resolved config object.
let current: { config: CloudflareAccessConfig; verify: AccessVerifier } | null = null

// Who the configured proxy says sent this request. Without Cloudflare Access
// configured, moi trusts no proxy and every request resolves to no provider.
export async function proxyIdentity(req: Request): Promise<ProxyIdentity> {
  const config = getAppConfig().cloudflareAccess
  if (!config) return { provider: null, profile: null }
  if (current?.config !== config) current = { config, verify: accessVerifier(config) }
  // The header Access adds wins; the cookie covers proxies that drop it.
  const token =
    req.headers.get(ACCESS_TOKEN_HEADER) ??
    new Bun.CookieMap(req.headers.get('cookie') ?? '').get(ACCESS_TOKEN_COOKIE)
  const user = token ? await current.verify(token) : null
  return { provider: 'cloudflare-access', profile: user ? accessProfile(user) : null }
}
