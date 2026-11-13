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
test('agent lifecycle uses real signatures, preserves keys on ambiguous acceptance, and confirms logout', async () => {
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
          remote: { user_id: 'owner', workspace_id: 'one' },
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
        return Response.json({
          success: true,
          remote: { user_id: 'owner', workspace_id: 'two' },
          membershipId: 'm2'
        })
      }
      if (path.endsWith('/leave')) {
        members.delete(path.split('/').at(-2)!.split(':')[1]!)
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
    async function cli(args: string[], code = 0) {
      const child = Bun.spawn(
        [
          process.execPath,
          join(import.meta.dir, '../cli.ts'),
          ...(args[0] === 'init' ? args : ['remote', ...args])
        ],
        { env: { ...Bun.env, MOI_DATA_DIR: dir, NO_COLOR: '1' }, stdout: 'pipe', stderr: 'pipe' }
      )
      const [stdout, stderr, exit] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited
      ])
      expect(exit).toBe(code)
      if (code === 0) expect(stderr).toBe('')
      return { stdout, stderr }
    }
    expect(
      (await cli(['accept', invite, '--name', 'Lawyer', '--client', 'muse'], 1)).stderr
    ).toContain('keys kept')
    expect((await stat(join(dir, 'remote-agent-pending.json'))).mode & 0o777).toBe(0o600)
    const acceptance = JSON.parse((await cli(['accept', invite, '--json'])).stdout)
    expect(acceptance.remote).toEqual({ user_id: 'owner', workspace_id: 'one' })
    expect(await Bun.file(join(dir, 'remote-agent-pending.json')).exists()).toBe(false)
    expect((await stat(join(dir, 'remote-auth.json'))).mode & 0o777).toBe(0o600)
    expect((await client.remoteStatus()).me).toMatchObject({ type: 'agent', name: 'Lawyer' })
    await expect(client.login(() => {})).rejects.toThrow('Signed in as an agent')
    await cli(['rename-agent', 'Legal assistant', '--json'])
    expect((await client.remoteStatus()).me.name).toBe('Legal assistant')
    expect(JSON.parse((await cli(['invitations', '--json'])).stdout)).toHaveLength(1)
    const folder = join(dir, 'workspace')
    const firstInit = JSON.parse(
      (await cli(['init', folder, '--remote', 'owner:one', '--json'])).stdout
    )
    expect(
      JSON.parse((await cli(['init', folder, '--remote', 'owner:one', '--json'])).stdout)
    ).toEqual(firstInit)
    const configFile = Bun.file(join(folder, '.moi/.workspace.json'))
    const originalConfig = await configFile.text()
    expect(JSON.parse(originalConfig)).toEqual({ version: 2, remote: acceptance.remote })
    for (const [flags, error] of [
      [[], 'use moi init --remote owner:one'],
      [['--remote', 'owner:two'], 'not shared'],
      [['--remote', ''], 'ownerId:workspaceId'],
      [['--remote', 'invalid'], 'ownerId:workspaceId'],
      [['--remote', 'owner:one', '--harness', 'codex'], '--harness']
    ] as const) {
      expect((await cli(['init', folder, ...flags], 1)).stderr).toContain(error)
    }
    expect(await configFile.text()).toBe(originalConfig)
    expect(await Bun.file(join(folder, '.agents/skills/moi-workspace/SKILL.md')).exists()).toBe(
      true
    )
    expect(await Bun.file(join(folder, '.moi/package.json')).exists()).toBe(false)
    expect(
      JSON.parse((await cli(['--json', '--path', folder])).stdout).currentWorkspace.workspace_id
    ).toBe('one')
    expect((await cli(['accept', 'second'])).stdout).toContain('moi init --remote owner:two')
    expect(await client.fetchSharedWorkspaces()).toHaveLength(2)
    expect((await cli(['init', folder, '--remote', 'owner:two', '--json'], 1)).stderr).toContain(
      'different workspace configuration'
    )
    expect(await configFile.text()).toBe(originalConfig)
    const localFolder = join(dir, 'local-workspace')
    const localConfig = Bun.file(join(localFolder, '.moi/.workspace.json'))
    await Bun.write(
      localConfig,
      JSON.stringify({ version: 1, widgetGrid: [], layoutMode: 'split' })
    )
    const localBefore = await localConfig.text()
    expect(
      (await cli(['init', localFolder, '--remote', 'owner:two', '--json'], 1)).stderr
    ).toContain('different workspace configuration')
    expect(await localConfig.text()).toBe(localBefore)
    expect((await cli(['leave', '', '--path', folder], 1)).stderr).toContain(
      'workspace address or --path'
    )
    expect((await cli(['leave', ''], 1)).stderr).toContain('ownerId:workspaceId')
    expect(await client.fetchSharedWorkspaces()).toHaveLength(2)
    await cli(['leave', '--path', folder, '--json'])
    expect(await client.fetchSharedWorkspaces()).toHaveLength(1)
    expect(await configFile.text()).toBe(originalConfig)
    await cli(['leave', 'owner:two', '--json'])
    expect(await client.fetchSharedWorkspaces()).toEqual([])
    for (const removed of ['join', 'link', 'unlink'])
      expect((await cli([removed], 1)).stderr).toContain(`Unknown command ${removed}`)
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
      createRemoteClient(dir).accept(
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
