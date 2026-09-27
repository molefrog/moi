import { afterEach, beforeAll, describe, expect, spyOn, test } from 'bun:test'

import { PERSONA_COLORS, colorForId } from '@/lib/collab/colors'

import { resetAppConfig } from '../app-config'
import {
  ACCESS_TOKEN_COOKIE,
  ACCESS_TOKEN_HEADER,
  CloudflareAccessVerifier,
  accessProfile,
  proxyIdentity
} from './cloudflare-access'

const ISSUER = 'https://acme.cloudflareaccess.com'
const AUD = 'aud-moi'
const NOW = Date.UTC(2026, 8, 27, 12)
const CONFIG = { teamDomain: ISSUER, audience: [AUD] }
const SIGNING = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }

type SigningKey = { kid: string; privateKey: CryptoKey; jwk: JsonWebKey & { kid: string } }
let current: SigningKey
let rotated: SigningKey

async function signingKey(kid: string): Promise<SigningKey> {
  const pair = await crypto.subtle.generateKey(
    { ...SIGNING, modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) },
    true,
    ['sign', 'verify']
  )
  const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey)
  return { kid, privateKey: pair.privateKey, jwk: { ...jwk, kid, alg: 'RS256', use: 'sig' } }
}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

async function token(
  claims: Record<string, unknown> = {},
  key: SigningKey = current,
  header: Record<string, unknown> = {}
): Promise<string> {
  const seconds = Math.floor(NOW / 1000)
  const signed = `${encode({ alg: 'RS256', kid: key.kid, typ: 'JWT', ...header })}.${encode({
    aud: [AUD],
    email: 'alex@example.com',
    exp: seconds + 3600,
    iat: seconds,
    nbf: seconds,
    iss: ISSUER,
    type: 'app',
    identity_nonce: 'nonce',
    sub: '7335d417-61da-459d-899c-0a01c76a2f94',
    country: 'US',
    ...claims
  })}`
  const signature = await crypto.subtle.sign(
    SIGNING,
    key.privateKey,
    new TextEncoder().encode(signed)
  )
  return `${signed}.${Buffer.from(signature).toString('base64url')}`
}

function certs(...keys: SigningKey[]) {
  const requests: string[] = []
  let failing = false
  const fetch = async (url: string) => {
    requests.push(url)
    if (failing) return new Response('Unavailable', { status: 503 })
    return Response.json({ keys: keys.map(key => key.jwk), public_cert: {}, public_certs: [] })
  }
  return {
    fetch,
    requests,
    keys,
    fail() {
      failing = true
    }
  }
}

function verifier(source = certs(current), clock = { now: NOW }) {
  return new CloudflareAccessVerifier(CONFIG, { fetch: source.fetch, now: () => clock.now })
}

beforeAll(async () => {
  current = await signingKey('key-current')
  rotated = await signingKey('key-rotated')
})

describe('CloudflareAccessVerifier', () => {
  test('a signed user token resolves to its user and reuses fetched keys', async () => {
    const source = certs(current)
    const access = verifier(source)
    const expected = { id: '7335d417-61da-459d-899c-0a01c76a2f94', email: 'alex@example.com' }
    expect(await access.verify(await token())).toEqual(expected)
    expect(await access.verify(await token({ aud: AUD }))).toEqual(expected)
    expect(source.requests).toEqual([`${ISSUER}/cdn-cgi/access/certs`])
  })

  test.each([
    ['another issuer', { iss: 'https://other.cloudflareaccess.com' }],
    ['another application', { aud: ['aud-other'] }],
    ['an expired token', { exp: Math.floor(NOW / 1000) - 61 }],
    ['a token without expiry', { exp: undefined }],
    ['a token that is not valid yet', { nbf: Math.floor(NOW / 1000) + 61 }],
    ['a service token', { sub: '', email: undefined, common_name: 'client.access' }],
    ['a token without an email', { email: undefined }]
  ])('rejects %s', async (_label, claims) => {
    expect(await verifier().verify(await token(claims))).toBeNull()
  })

  test('tolerates a minute of clock drift', async () => {
    const seconds = Math.floor(NOW / 1000)
    const drifted = await token({ exp: seconds - 30, nbf: seconds + 30 })
    expect(await verifier().verify(drifted)).not.toBeNull()
  })

  test('rejects forged signatures and other algorithms', async () => {
    const source = certs(current)
    const access = verifier(source)
    const [header, , signature] = (await token()).split('.')
    const forged = `${header}.${encode({ sub: 'someone-else', email: 'eve@example.com' })}.${signature}`
    expect(await access.verify(forged)).toBeNull()
    expect(await access.verify(await token({}, rotated, { kid: current.kid }))).toBeNull()
    const unsigned = `${encode({ alg: 'none', kid: current.kid })}.${encode({ sub: 'x' })}.`
    expect(await access.verify(unsigned)).toBeNull()
    expect(await access.verify(await token({}, current, { alg: 'HS256' }))).toBeNull()
  })

  test('malformed tokens resolve to null without fetching keys', async () => {
    const source = certs(current)
    const access = verifier(source)
    for (const malformed of ['', 'a.b', 'a.b.c.d', 'not base64!.e30.sig', '..']) {
      expect(await access.verify(malformed)).toBeNull()
    }
    expect(source.requests).toEqual([])
  })

  test('an unknown key id refetches the key set at most once a minute', async () => {
    const source = certs(current)
    const clock = { now: NOW }
    const access = verifier(source, clock)
    expect(await access.verify(await token())).not.toBeNull()
    // Cloudflare rotates keys; the new one appears in the published set.
    source.keys.push(rotated)
    clock.now += 30_000
    expect(await access.verify(await token({}, rotated))).toBeNull()
    expect(source.requests).toHaveLength(1)
    clock.now += 30_000
    expect(await access.verify(await token({}, rotated))).not.toBeNull()
    expect(source.requests).toHaveLength(2)
  })

  test('concurrent requests share one key fetch', async () => {
    const source = certs(current)
    const access = verifier(source)
    const tokens = await Promise.all([token(), token(), token()])
    const users = await Promise.all(tokens.map(value => access.verify(value)))
    expect(users.every(Boolean)).toBe(true)
    expect(source.requests).toHaveLength(1)
  })

  test('a failed refresh keeps the keys it already has', async () => {
    const source = certs(current)
    const clock = { now: NOW }
    const access = verifier(source, clock)
    expect(await access.verify(await token())).not.toBeNull()
    source.fail()
    clock.now += 60_000
    const errors = spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect(await access.verify(await token({}, rotated))).toBeNull()
      expect(errors.mock.calls.join('\n')).toContain('could not load signing keys')
    } finally {
      errors.mockRestore()
    }
    expect(await access.verify(await token())).not.toBeNull()
  })
})

describe('accessProfile', () => {
  test('names the user after the email local part and colors them by id', () => {
    const profile = accessProfile({ id: 'user-1', email: 'alex.doe@example.com' })
    expect(profile).toEqual({
      id: 'user-1',
      name: 'alex.doe',
      color: colorForId('user-1'),
      email: 'alex.doe@example.com'
    })
    expect(PERSONA_COLORS.map(([, hex]) => hex as string)).toContain(profile?.color ?? '')
    expect(accessProfile({ id: 'user-1', email: 'other@example.com' })?.color).toBe(profile?.color)
  })

  test('falls back to the whole email and rejects profiles moi cannot carry', () => {
    expect(accessProfile({ id: 'user-2', email: '@example.com' })?.name).toBe('@example.com')
    expect(accessProfile({ id: 'x'.repeat(241), email: 'a@example.com' })).toBeNull()
  })
})

describe('proxyIdentity', () => {
  const envKeys = ['MOI_CLOUDFLARE_ACCESS_TEAM_DOMAIN', 'MOI_CLOUDFLARE_ACCESS_AUD'] as const
  const saved = Object.fromEntries(envKeys.map(key => [key, process.env[key]]))

  afterEach(() => {
    for (const key of envKeys) {
      if (saved[key] === undefined) delete process.env[key]
      else process.env[key] = saved[key]
    }
    resetAppConfig()
  })

  function request(value?: string, cookie?: string) {
    return new Request('http://moi.test/api/identity', {
      headers: {
        ...(value ? { [ACCESS_TOKEN_HEADER]: value } : {}),
        ...(cookie ? { cookie: `theme=dark; ${ACCESS_TOKEN_COOKIE}=${cookie}` } : {})
      }
    })
  }

  test('without Cloudflare Access configured, headers are ignored', async () => {
    for (const key of envKeys) delete process.env[key]
    resetAppConfig()
    expect(await proxyIdentity(request(await token()))).toEqual({ provider: null, identity: null })
  })

  test('with Cloudflare Access configured, only a valid token yields an identity', async () => {
    process.env.MOI_CLOUDFLARE_ACCESS_TEAM_DOMAIN = 'acme'
    process.env.MOI_CLOUDFLARE_ACCESS_AUD = AUD
    resetAppConfig()
    const source = certs(current)
    const fetch = spyOn(globalThis, 'fetch').mockImplementation((input =>
      source.fetch(String(input))) as typeof globalThis.fetch)
    const clock = spyOn(Date, 'now').mockImplementation(() => NOW)
    try {
      expect(await proxyIdentity(request(await token()))).toEqual({
        provider: 'cloudflare-access',
        identity: {
          id: '7335d417-61da-459d-899c-0a01c76a2f94',
          name: 'alex',
          color: colorForId('7335d417-61da-459d-899c-0a01c76a2f94'),
          email: 'alex@example.com'
        }
      })
      expect(await proxyIdentity(request())).toEqual({
        provider: 'cloudflare-access',
        identity: null
      })
      expect(await proxyIdentity(request(await token({ aud: ['aud-other'] })))).toEqual({
        provider: 'cloudflare-access',
        identity: null
      })
      // A browser's Access cookie carries the same token when no header arrives,
      // but a header Access sent is never overridden by a cookie.
      const fromCookie = await proxyIdentity(request(undefined, await token()))
      expect(fromCookie.identity?.email).toBe('alex@example.com')
      const conflicting = request(await token({ aud: ['aud-other'] }), await token())
      expect((await proxyIdentity(conflicting)).identity).toBeNull()
      expect(source.requests).toEqual([`${ISSUER}/cdn-cgi/access/certs`])
    } finally {
      fetch.mockRestore()
      clock.mockRestore()
    }
  })
})
