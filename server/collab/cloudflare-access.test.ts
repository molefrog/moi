import { beforeAll, expect, spyOn, test } from 'bun:test'
import { SignJWT, UnsecuredJWT, exportJWK, generateKeyPair } from 'jose'
import type { CryptoKey, JWK, JWTPayload } from 'jose'

import { colorForId } from '@/lib/collab/colors'

import { resetAppConfig } from '../app-config'
import {
  ACCESS_TOKEN_COOKIE,
  ACCESS_TOKEN_HEADER,
  accessVerifier,
  proxyIdentity
} from './cloudflare-access'

const ISSUER = 'https://acme.cloudflareaccess.com'
const SUB = '7335d417-61da-459d-899c-0a01c76a2f94'
const SECONDS = Math.floor(Date.now() / 1000)
const CLAIMS = { iss: ISSUER, aud: 'aud-moi', sub: SUB, email: 'alex@example.com' }

type Key = { kid: string; privateKey: CryptoKey; jwk: JWK }
let current: Key
let rotated: Key

async function signingKey(kid: string): Promise<Key> {
  const { privateKey, publicKey } = await generateKeyPair('RS256')
  return { kid, privateKey, jwk: { ...(await exportJWK(publicKey)), kid, alg: 'RS256' } }
}

function token(claims: JWTPayload = {}, key = current, kid = key.kid): Promise<string> {
  return new SignJWT({ ...CLAIMS, exp: SECONDS + 3600, ...claims })
    .setProtectedHeader({ alg: 'RS256', kid })
    .sign(key.privateKey)
}

function verifier(keys: Key[]) {
  const requests: string[] = []
  const verify = accessVerifier({ teamDomain: ISSUER, audience: ['aud-moi'] }, async url => {
    requests.push(url)
    return Response.json({ keys: keys.map(key => key.jwk) })
  })
  return { verify, requests }
}

beforeAll(async () => {
  ;[current, rotated] = await Promise.all([signingKey('current'), signingKey('rotated')])
})

test('a signed user token resolves to its user with one key fetch', async () => {
  const { verify, requests } = verifier([current])
  const user = { id: SUB, email: 'alex@example.com' }
  expect(await verify(await token())).toEqual(user)
  expect(await verify(await token({ aud: ['aud-other', 'aud-moi'] }))).toEqual(user)
  expect(requests).toEqual([`${ISSUER}/cdn-cgi/access/certs`])
})

test.each([
  ['another issuer', () => token({ iss: 'https://other.cloudflareaccess.com' })],
  ['another application', () => token({ aud: 'aud-other' })],
  ['an expired token', () => token({ exp: SECONDS - 600 })],
  ['a token without expiry', () => token({ exp: undefined })],
  ['a token that is not valid yet', () => token({ nbf: SECONDS + 600 })],
  ['a service token', () => token({ sub: '', email: undefined })],
  ['a forged signature', () => token({}, rotated, 'current')],
  ['an unsigned token', async () => new UnsecuredJWT({ ...CLAIMS, exp: SECONDS + 60 }).encode()],
  ['a malformed token', async () => 'not.a.token']
])('rejects %s', async (_label, make) => {
  expect(await verifier([current]).verify(await make())).toBeNull()
})

test('keys refresh for an unknown key id after a cooldown and expire after ten minutes', async () => {
  const keys = [current]
  const { verify, requests } = verifier(keys)
  const start = Date.now()
  const clock = spyOn(Date, 'now')
  const at = (ms: number) => clock.mockReturnValue(start + ms)
  try {
    at(0)
    expect(await verify(await token())).not.toBeNull()
    keys.push(rotated)
    at(10_000)
    expect(await verify(await token({}, rotated))).toBeNull()
    at(30_000)
    expect(await verify(await token({}, rotated))).not.toBeNull()
    // Cloudflare stops publishing the old key; the cached copy expires.
    keys.shift()
    at(30_000 + 9 * 60_000)
    expect(await verify(await token())).not.toBeNull()
    at(30_000 + 10 * 60_000)
    expect(await verify(await token())).toBeNull()
    expect(requests).toHaveLength(3)
  } finally {
    clock.mockRestore()
  }
})

test('requests get a nameless Access profile only when Access is configured', async () => {
  const valid = await token()
  const request = (headers: Record<string, string>) => new Request(ISSUER, { headers })
  const fetch = spyOn(globalThis, 'fetch').mockImplementation((async () =>
    Response.json({ keys: [current.jwk] })) as unknown as typeof globalThis.fetch)
  try {
    expect(await proxyIdentity(request({ [ACCESS_TOKEN_HEADER]: valid }))).toEqual({
      provider: null,
      identity: null
    })
    process.env.MOI_CLOUDFLARE_ACCESS_TEAM_DOMAIN = 'acme'
    process.env.MOI_CLOUDFLARE_ACCESS_AUD = 'aud-moi'
    resetAppConfig()
    const identity = { id: SUB, color: colorForId(SUB), email: 'alex@example.com' }
    expect(await proxyIdentity(request({ [ACCESS_TOKEN_HEADER]: valid }))).toEqual({
      provider: 'cloudflare-access',
      identity
    })
    const cookie = { cookie: `${ACCESS_TOKEN_COOKIE}=${valid}` }
    expect((await proxyIdentity(request(cookie))).identity).toEqual(identity)
    expect((await proxyIdentity(request({}))).identity).toBeNull()
  } finally {
    fetch.mockRestore()
    delete process.env.MOI_CLOUDFLARE_ACCESS_TEAM_DOMAIN
    delete process.env.MOI_CLOUDFLARE_ACCESS_AUD
    resetAppConfig()
  }
})
