import { calculateJwkThumbprint, exportJWK, generateKeyPair, importJWK, SignJWT } from 'jose'
import { z } from 'zod'

const privateKey = z.object({
  kty: z.literal('OKP'),
  crv: z.literal('Ed25519'),
  x: z.string().regex(/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/),
  d: z.string().regex(/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/)
})
export const agentCredentialsSchema = z.object({
  kind: z.literal('agent'),
  url: z.string(),
  clientId: z.string(),
  agentId: z.string(),
  hostId: z.string(),
  agentKey: privateKey,
  hostKey: privateKey
})
export type AgentCredentials = z.infer<typeof agentCredentialsSchema>

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
      .join(',')}}`
  return JSON.stringify(value)
}
const hash = (value: string | Uint8Array<ArrayBuffer>) =>
  new Bun.CryptoHasher('sha256').update(value).digest('base64url')
export async function createAgentKeys(config: {
  url: string
  clientId: string
}): Promise<AgentCredentials> {
  const host = await generateKeyPair('EdDSA', { extractable: true }),
    agent = await generateKeyPair('EdDSA', { extractable: true })
  const hostKey = privateKey.parse(await exportJWK(host.privateKey))
  const agentKey = privateKey.parse(await exportJWK(agent.privateKey))
  return {
    kind: 'agent',
    ...config,
    hostKey,
    agentKey,
    hostId: `h_${await calculateJwkThumbprint(hostKey)}`,
    agentId: `a_${await calculateJwkThumbprint(agentKey)}`
  }
}
function publicKey(key: AgentCredentials['agentKey']) {
  return { kty: key.kty, crv: key.crv, x: key.x }
}
async function sign(
  keys: AgentCredentials,
  key: AgentCredentials['agentKey'],
  typ: string,
  url: string,
  method: string,
  body: string | Uint8Array<ArrayBuffer>
) {
  const requestHash = hash(`${method.toUpperCase()}\n${url}\n${hash(body)}`)
  return new SignJWT({ sub: keys.agentId, iss: keys.hostId, requestHash })
    .setProtectedHeader({ alg: 'EdDSA', typ })
    .setAudience(`${keys.url}/api/auth`)
    .setIssuedAt()
    .setExpirationTime('60s')
    .setJti(crypto.randomUUID())
    .sign(await importJWK(key, 'EdDSA'))
}
export async function agentAuthorization(
  keys: AgentCredentials,
  url: string,
  method: string,
  body: string | Uint8Array<ArrayBuffer>
) {
  return `Bearer ${await sign(keys, keys.agentKey, 'agent+jwt', url, method, body)}`
}
export async function agentJoinBody(
  keys: AgentCredentials,
  token: string,
  name: string,
  client: string
) {
  const unsigned = {
    token,
    name,
    client,
    hostPublicKey: publicKey(keys.hostKey),
    agentPublicKey: publicKey(keys.agentKey)
  }
  const body = canonical(unsigned),
    url = `${keys.url}/api/agents/join`
  return {
    ...unsigned,
    proof: {
      host: await sign(keys, keys.hostKey, 'host+jwt', url, 'POST', body),
      agent: await sign(keys, keys.agentKey, 'agent+jwt', url, 'POST', body)
    }
  }
}
