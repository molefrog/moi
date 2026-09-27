import { beforeAll, expect, spyOn, test } from 'bun:test'

import { colorForId } from '@/lib/collab/colors'

import { resetAppConfig } from '../app-config'
import {
  ACCESS_TOKEN_COOKIE,
  ACCESS_TOKEN_HEADER,
  CloudflareAccessVerifier,
  proxyIdentity
} from './cloudflare-access'

const ISSUER = 'https://acme.cloudflareaccess.com'
const NOW = Date.UTC(2026, 8, 27, 12)
const SECONDS = NOW / 1000
const SUB = '7335d417-61da-459d-899c-0a01c76a2f94'
const RS256 = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }

type Key = { kid: string; privateKey: CryptoKey; jwk: JsonWebKey & { kid: string } }
let current: Key
let rotated: Key

async function signingKey(kid: string): Promise<Key> {
  const { privateKey, publicKey } = await crypto.subtle.generateKey(
    { ...RS256, modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) },
    true,
    ['sign', 'verify']
  )
  return { kid, privateKey, jwk: { ...(await crypto.subtle.exportKey('jwk', publicKey)), kid } }
}

const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')

async function token(claims = {}, key = current, header = {}): Promise<string> {
  const payload = { iss: ISSUER, aud: ['aud-moi'], sub: SUB, email: 'alex@example.com' }
  const signed = `${encode({ alg: 'RS256', kid: key.kid, ...header })}.${encode({
    ...payload,
    exp: SECONDS + 3600,
    nbf: SECONDS,
    ...claims
  })}`
  const signature = await crypto.subtle.sign(RS256, key.privateKey, Buffer.from(signed))
  return `${signed}.${Buffer.from(signature).toString('base64url')}`
}

function verifier(keys: Key[], clock = { now: NOW }) {
  const requests: string[] = []
  const access = new CloudflareAccessVerifier(
    { teamDomain: ISSUER, audience: ['aud-moi'] },
    {
      now: () => clock.now,
      fetch: async url => {
        requests.push(url)
        return Response.json({ keys: keys.map(key => key.jwk) })
      }
    }
  )
  return { access, requests }
}

beforeAll(async () => {
  ;[current, rotated] = await Promise.all([signingKey('current'), signingKey('rotated')])
})

test('a signed user token resolves to its user with one key fetch', async () => {
  const { access, requests } = verifier([current])
  const user = { id: SUB, email: 'alex@example.com' }
  expect(await access.verify(await token())).toEqual(user)
  expect(await access.verify(await token({ aud: 'aud-moi' }))).toEqual(user)
  expect(requests).toEqual([`${ISSUER}/cdn-cgi/access/certs`])
})

test.each([
  ['another issuer', () => token({ iss: 'https://other.cloudflareaccess.com' })],
  ['another application', () => token({ aud: ['aud-other'] })],
  ['an expired token', () => token({ exp: SECONDS - 61 })],
  ['a token that is not valid yet', () => token({ nbf: SECONDS + 61 })],
  ['a service token', () => token({ sub: '', email: undefined })],
  ['a forged signature', () => token({}, rotated, { kid: 'current' })],
  ['another algorithm', () => token({}, current, { alg: 'HS256' })],
  ['a malformed token', async () => 'not.a.token']
])('rejects %s', async (_label, make) => {
  expect(await verifier([current]).access.verify(await make())).toBeNull()
})

test('an unknown key id refetches the keys at most once a minute', async () => {
  const keys = [current]
  const clock = { now: NOW }
  const { access, requests } = verifier(keys, clock)
  expect(await access.verify(await token())).not.toBeNull()
  keys.push(rotated)
  clock.now += 30_000
  expect(await access.verify(await token({}, rotated))).toBeNull()
  clock.now += 30_000
  expect(await access.verify(await token({}, rotated))).not.toBeNull()
  expect(requests).toHaveLength(2)
})

test('a key Cloudflare stops publishing stops verifying within ten minutes', async () => {
  const keys = [current]
  const clock = { now: NOW }
  const { access } = verifier(keys, clock)
  expect(await access.verify(await token())).not.toBeNull()
  keys.splice(0, 1, rotated)
  clock.now += 10 * 60_000
  expect(await access.verify(await token())).toBeNull()
})

test('requests get a nameless Access profile only when Access is configured', async () => {
  const valid = await token()
  const request = (headers: Record<string, string>) => new Request(ISSUER, { headers })
  const fetch = spyOn(globalThis, 'fetch').mockImplementation((async () =>
    Response.json({ keys: [current.jwk] })) as unknown as typeof globalThis.fetch)
  const clock = spyOn(Date, 'now').mockImplementation(() => NOW)
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
    clock.mockRestore()
    delete process.env.MOI_CLOUDFLARE_ACCESS_TEAM_DOMAIN
    delete process.env.MOI_CLOUDFLARE_ACCESS_AUD
    resetAppConfig()
  }
})
