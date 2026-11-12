import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { importJWK, jwtVerify } from 'jose'
import { createAgentKeys } from '../remote/agent'
import { createRemoteClient } from '../remote/client'

test('agent operations sign exact binary bytes and reject oversize uploads locally', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'moi-ops-auth-'))
  const hash = (value: string | Uint8Array<ArrayBuffer>) =>
    new Bun.CryptoHasher('sha256').update(value).digest('base64url')
  let requests = 0
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      requests++
      const bytes = new Uint8Array(await request.arrayBuffer())
      const { payload } = await jwtVerify(
        request.headers.get('authorization')!.slice(7),
        await importJWK(
          { kty: keys.agentKey.kty, crv: keys.agentKey.crv, x: keys.agentKey.x },
          'EdDSA'
        )
      )
      expect(payload.requestHash).toBe(hash(`${request.method}\n${request.url}\n${hash(bytes)}`))
      return Response.json({ ok: true })
    }
  })
  const config = { url: `http://localhost:${server.port}/cloud`, clientId: 'moi-cli' }
  const keys = await createAgentKeys(config)
  try {
    await Bun.write(join(dir, 'config.json'), JSON.stringify({ remote: config }))
    await Bun.write(join(dir, 'remote-auth.json'), JSON.stringify(keys))
    const client = createRemoteClient(dir)
    const bytes = crypto.getRandomValues(new Uint8Array(10_000))
    expect(
      (
        await client.operation('owner', 'workspace', '/files/photo.bin', {
          method: 'PUT',
          body: new Blob([bytes])
        })
      ).status
    ).toBe(200)
    await expect(
      client.operation('owner', 'workspace', '/files/large.bin', {
        method: 'PUT',
        body: new Blob([new Uint8Array(16 * 1024 * 1024 + 1)])
      })
    ).rejects.toThrow('16 MiB')
    expect(requests).toBe(1)
  } finally {
    server.stop(true)
    await rm(dir, { recursive: true, force: true })
  }
})
