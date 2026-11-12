import { expect, test } from 'bun:test'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { calculateJwkThumbprint, importJWK, jwtVerify, type JWK } from 'jose'
import { createRemoteClient } from './client'

const hash = (s: string) => new Bun.CryptoHasher('sha256').update(s).digest('base64url')
function canonical(value: unknown): string {
  if (value && typeof value === 'object' && !Array.isArray(value))
    return JSON.stringify(value, Object.keys(value).sort())
  return JSON.stringify(value)
}
test('agent lifecycle uses real signatures, preserves keys on ambiguous joins, and confirms logout', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'moi-agent-'))
  let keys: { host: JWK; agent: JWK } | undefined
  let agentId = '',
    hostId = '',
    name = 'Lawyer',
    active = false,
    firstResponseLost = true
  const used = new Set<string>(),
    members = new Set(['one'])
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      const path = new URL(request.url).pathname,
        raw = await request.text()
      const audience = server.url.origin + '/cloud/api/auth'
      if (path.endsWith('/agents/join')) {
        const body = JSON.parse(raw) as {
          token: string
          name: string
          client: string
          hostPublicKey: JWK
          agentPublicKey: JWK
          proof: { host: string; agent: string }
        }
        keys ??= { host: body.hostPublicKey, agent: body.agentPublicKey }
        const unsigned: Record<string, unknown> = {
          token: body.token,
          name: body.name,
          client: body.client,
          hostPublicKey: body.hostPublicKey,
          agentPublicKey: body.agentPublicKey
        }
        // Independent canonical serialization of this flat request and its JWKs.
        const canonicalBody =
          '{' +
          Object.keys(unsigned)
            .sort()
            .map(k => JSON.stringify(k) + ':' + canonical(unsigned[k]))
            .join(',') +
          '}'
        for (const kind of ['host', 'agent'] as const) {
          const proof = await jwtVerify(body.proof[kind], await importJWK(keys[kind], 'EdDSA'), {
            audience,
            algorithms: ['EdDSA']
          })
          expect(proof.payload.requestHash).toBe(
            hash('POST\n' + request.url + '\n' + hash(canonicalBody))
          )
          expect(proof.protectedHeader.typ).toBe(kind + '+jwt')
        }
        agentId = 'a_' + (await calculateJwkThumbprint(keys.agent))
        hostId = 'h_' + (await calculateJwkThumbprint(keys.host))
        active = true
        name = body.name
        if (firstResponseLost) {
          firstResponseLost = false
          return new Response(null, { status: 503 })
        }
        return Response.json({
          success: true,
          workspaceId: 'one',
          membershipId: 'm1',
          agentId,
          hostId
        })
      }
      if (!keys || !active) return new Response(null, { status: 401 })
      const jwt = request.headers.get('authorization')?.slice(7) ?? ''
      const { payload } = await jwtVerify(jwt, await importJWK(keys.agent, 'EdDSA'), {
        audience,
        algorithms: ['EdDSA']
      })
      expect(payload.sub).toBe(agentId)
      expect(payload.iss).toBe(hostId)
      expect(payload.requestHash).toBe(hash(request.method + '\n' + request.url + '\n' + hash(raw)))
      expect(used.has(payload.jti!)).toBe(false)
      used.add(payload.jti!)
      if (path.endsWith('/me')) {
        if (request.method === 'PATCH') name = JSON.parse(raw).name
        return Response.json({ id: agentId, type: 'agent', name, client: 'muse' })
      }
      if (path.endsWith('/workspaces/shared'))
        return Response.json({
          workspaces: [...members].map(id => ({
            id,
            owner: { id: 'owner', name: 'Owner', email: 'owner@example.com' }
          }))
        })
      if (path.endsWith('/workspaces/invitations'))
        return Response.json({
          invitations: [
            {
              id: 'second',
              workspaceId: 'two',
              workspaceName: 'Second',
              inviter: { id: 'owner', name: 'Owner', email: 'owner@example.com' },
              expiresAt: new Date(Date.now() + 60000).toISOString()
            }
          ]
        })
      if (path.endsWith('/invitations/second/accept')) {
        members.add('two')
        return Response.json({ success: true, workspaceId: 'two', membershipId: 'm2' })
      }
      if (path.endsWith('/leave')) {
        members.delete('one')
        return Response.json({ success: true })
      }
      if (path.endsWith('/agents/logout')) {
        active = false
        return Response.json({ success: true })
      }
      return new Response(null, { status: 404 })
    }
  })
  try {
    const url = server.url.origin + '/cloud'
    await Bun.write(join(dir, 'config.json'), JSON.stringify({ remote: { url } }))
    const client = createRemoteClient(dir),
      invite = url + '/agent-invite/first?token=' + 'A'.repeat(43)
    await expect(client.joinAgent(invite, 'Lawyer', 'Muse')).rejects.toThrow('keys kept')
    expect((await stat(join(dir, 'remote-agent-pending.json'))).mode & 0o777).toBe(0o600)
    async function cli(args: string[], code = 0) {
      const process = Bun.spawn(
        [Bun.which('bun')!, join(import.meta.dir, '../cli.ts'), 'remote', ...args],
        { env: { ...Bun.env, MOI_DATA_DIR: dir, NO_COLOR: '1' }, stdout: 'pipe', stderr: 'pipe' }
      )
      const [stdout, stderr, exit] = await Promise.all([
        new Response(process.stdout).text(),
        new Response(process.stderr).text(),
        process.exited
      ])
      expect(exit).toBe(code)
      if (code === 0) expect(stderr).toBe('')
      return { stdout, stderr }
    }
    await cli(['join', invite, '--json'])
    expect(await Bun.file(join(dir, 'remote-agent-pending.json')).exists()).toBe(false)
    expect((await stat(join(dir, 'remote-auth.json'))).mode & 0o777).toBe(0o600)
    expect((await client.remoteStatus()).me).toMatchObject({ type: 'agent', name: 'Lawyer' })
    await expect(client.login(() => {})).rejects.toThrow('Signed in as an agent')
    await cli(['rename-agent', 'Legal assistant', '--json'])
    expect((await client.remoteStatus()).me.name).toBe('Legal assistant')
    expect(JSON.parse((await cli(['invitations', '--json'])).stdout)).toHaveLength(1)
    const folder = join(dir, 'workspace')
    await cli(['link', '--owner-id', 'owner', '--workspace-id', 'one', '--path', folder, '--json'])
    expect(
      JSON.parse((await cli(['--json', '--path', folder])).stdout).currentWorkspace.workspace_id
    ).toBe('one')
    await cli(['unlink', '--path', folder, '--json'])
    expect(
      JSON.parse((await cli(['--json', '--path', folder])).stdout).currentWorkspace
    ).toBeUndefined()
    await cli(['join', 'second', '--json'])
    expect(await client.fetchSharedWorkspaces()).toHaveLength(2)
    await cli(['leave', '--owner-id', 'owner', '--workspace-id', 'one', '--json'])
    expect(await client.fetchSharedWorkspaces()).toHaveLength(1)
    expect((await cli(['logout'], 1)).stderr).toContain('--yes')
    expect(active).toBe(true)
    await cli(['logout', '--yes'])
    expect(active).toBe(false)
    expect(await Bun.file(join(dir, 'remote-auth.json')).exists()).toBe(false)
  } finally {
    server.stop(true)
    await rm(dir, { recursive: true, force: true })
  }
})

test('human credentials cannot be overwritten by an agent invitation', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'moi-human-'))
  try {
    const url = 'https://run.moi.computer/cloud',
      file = join(dir, 'remote-auth.json')
    await Bun.write(join(dir, 'config.json'), JSON.stringify({ remote: { url } }))
    const credentials = {
      url,
      clientId: 'moi-cli',
      accessToken: 'human-access',
      refreshToken: 'human-refresh'
    }
    await Bun.write(file, JSON.stringify(credentials))
    await expect(
      createRemoteClient(dir).joinAgent(
        url + '/agent-invite/a?token=' + 'A'.repeat(43),
        'Lawyer',
        'muse'
      )
    ).rejects.toThrow('Already signed in as a human')
    expect(await Bun.file(file).json()).toEqual(credentials)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
