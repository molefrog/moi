import { expect, test } from 'bun:test'
import { COLLAB_ACTOR_HEADER, verifyCloudActor } from './cloud-actor'

const nowMs = 1_800_000_000_000
const now = Math.floor(nowMs / 1000)
const keys = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify'])
const publicJwk = await crypto.subtle.exportKey('jwk', keys.publicKey)
const claims = {
  iss: 'moi-cloud',
  aud: 'moi-collab',
  sub: 'alex',
  type: 'user',
  workspaceId: 'workspace',
  iat: now,
  exp: now + 60
}
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
async function token(
  payload: Record<string, unknown> = claims,
  header: unknown = { alg: 'EdDSA', typ: 'JWT' }
) {
  const input = `${encode(header)}.${encode(payload)}`
  const signature = await crypto.subtle.sign(
    'Ed25519',
    keys.privateKey,
    new TextEncoder().encode(input)
  )
  return `${input}.${Buffer.from(signature).toString('base64url')}`
}
const request = (value?: string) =>
  new Request('https://machine.test/api/workspaces/workspace/collab/ws', {
    headers: value ? { [COLLAB_ACTOR_HEADER]: value } : {}
  })
const options = { publicJwk, nowMs }

test('verified proxy assertion resolves a workspace-scoped actor, including future agents', async () => {
  expect(await verifyCloudActor(request(await token()), 'workspace', options)).toEqual({
    id: 'alex',
    type: 'user',
    workspaceId: 'workspace'
  })
  expect(
    await verifyCloudActor(request(await token({ ...claims, type: 'agent' })), 'workspace', options)
  ).toEqual({ id: 'alex', type: 'agent', workspaceId: 'workspace' })
})

test('missing, forged and wrong-workspace assertions cannot authenticate a socket', async () => {
  expect(await verifyCloudActor(request(), 'workspace', options)).toBeNull()
  const signed = await token()
  const pieces = signed.split('.')
  pieces[1] = encode({ ...claims, sub: 'tony' })
  expect(await verifyCloudActor(request(pieces.join('.')), 'workspace', options)).toBeNull()
  expect(await verifyCloudActor(request(signed), 'other-workspace', options)).toBeNull()
  const other = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify'])
  expect(
    await verifyCloudActor(request(signed), 'workspace', {
      ...options,
      publicJwk: await crypto.subtle.exportKey('jwk', other.publicKey)
    })
  ).toBeNull()
})

test('expired, overly long-lived, future and invalid-purpose assertions are rejected', async () => {
  for (const payload of [
    { ...claims, exp: now },
    { ...claims, exp: now + 3600 },
    { ...claims, iat: now + 10 },
    { ...claims, iss: 'someone-else' },
    { ...claims, aud: 'other-app' },
    { ...claims, sub: '' },
    { ...claims, type: 'unknown' },
    { ...claims, nbf: now + 5 }
  ])
    expect(await verifyCloudActor(request(await token(payload)), 'workspace', options)).toBeNull()
  expect(
    await verifyCloudActor(
      request(await token(claims, { alg: 'none', typ: 'JWT' })),
      'workspace',
      options
    )
  ).toBeNull()
  expect(await verifyCloudActor(request('broken.assertion'), 'workspace', options)).toBeNull()
})
