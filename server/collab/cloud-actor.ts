/** A server-to-server assertion. This header is never a browser credential. */
export const COLLAB_ACTOR_HEADER = 'X-Moi-Collab-Actor'

export type CloudActor = { id: string; type: 'user' | 'agent'; workspaceId: string }
type VerifyOptions = { publicJwk?: JsonWebKey; nowMs?: number }
const encoder = new TextEncoder()
let fileKey: { path: string; key: Promise<CryptoKey> } | undefined

function publicKey(jwk: JsonWebKey): Promise<CryptoKey> {
  if (jwk.kty !== 'OKP' || jwk.crv !== 'Ed25519' || jwk.d)
    throw new Error('Expected a public Ed25519 key')
  return crypto.subtle.importKey('jwk', jwk, 'Ed25519', false, ['verify'])
}

function configuredKey(): Promise<CryptoKey> {
  const path = process.env.MOI_COLLAB_PUBLIC_KEY_FILE || '/etc/moi/collab-public-key.json'
  if (fileKey?.path === path) return fileKey.key
  const key = Bun.file(path).json().then(publicKey)
  fileKey = { path, key }
  return key
}

function decode(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid JWT encoding')
  const binary = atob(value.replaceAll('-', '+').replaceAll('_', '/'))
  return Uint8Array.from(binary, character => character.charCodeAt(0))
}

function object(value: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(
    new TextDecoder('utf-8', { fatal: true }).decode(decode(value))
  )
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new Error('Invalid claims')
  return parsed as Record<string, unknown>
}

/** Missing keys, missing assertions and any invalid claims all fail closed. */
export async function verifyCloudActor(
  request: Request,
  workspaceId: string,
  options: VerifyOptions = {}
): Promise<CloudActor | null> {
  try {
    const token = request.headers.get(COLLAB_ACTOR_HEADER)
    if (!token || token.length > 4096) return null
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const [headerPart, payloadPart, signaturePart] = parts
    const header = object(headerPart)
    if (header.alg !== 'EdDSA' || header.typ !== 'JWT' || header.crit !== undefined) return null
    const key = options.publicJwk ? await publicKey(options.publicJwk) : await configuredKey()
    if (
      !(await crypto.subtle.verify(
        'Ed25519',
        key,
        decode(signaturePart),
        encoder.encode(`${headerPart}.${payloadPart}`)
      ))
    )
      return null
    const payload = object(payloadPart)
    const now = Math.floor((options.nowMs ?? Date.now()) / 1000)
    if (
      payload.iss !== 'moi-cloud' ||
      payload.aud !== 'moi-collab' ||
      typeof payload.sub !== 'string' ||
      !payload.sub ||
      payload.sub.length > 240 ||
      payload.sub.trim() !== payload.sub ||
      [...payload.sub].some(
        character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127
      ) ||
      (payload.type !== 'user' && payload.type !== 'agent') ||
      payload.workspaceId !== workspaceId ||
      !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(workspaceId) ||
      typeof payload.iat !== 'number' ||
      !Number.isInteger(payload.iat) ||
      typeof payload.exp !== 'number' ||
      !Number.isInteger(payload.exp) ||
      payload.exp <= now ||
      payload.iat > now + 5 ||
      payload.exp <= payload.iat ||
      payload.exp - payload.iat > 60 ||
      (payload.nbf !== undefined && (typeof payload.nbf !== 'number' || payload.nbf > now))
    )
      return null
    return { id: payload.sub, type: payload.type, workspaceId }
  } catch {
    return null
  }
}
