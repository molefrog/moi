import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('remote after logout gives a concise sign-in message without a stack trace', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'moi-remote-cli-'))
  try {
    await Bun.write(
      join(directory, 'config.json'),
      JSON.stringify({ remote: { url: 'http://localhost:8787/cloud' } })
    )
    const logout = Bun.spawn(['bun', join(import.meta.dir, '../../cli.ts'), 'remote', 'logout'], {
      env: { ...Bun.env, MOI_DATA_DIR: directory, NO_COLOR: '1' },
      stdout: 'pipe',
      stderr: 'pipe'
    })
    expect(await logout.exited).toBe(0)
    expect((await new Response(logout.stdout).text()).trim()).toBe('✓ Signed out')
    expect(await new Response(logout.stderr).text()).toBe('')
    const process = Bun.spawn(['bun', join(import.meta.dir, '../../cli.ts'), 'remote'], {
      env: { ...Bun.env, MOI_DATA_DIR: directory },
      stdout: 'pipe',
      stderr: 'pipe'
    })
    const [code, stdout, stderr] = await Promise.all([
      process.exited,
      new Response(process.stdout).text(),
      new Response(process.stderr).text()
    ])
    expect(code).toBe(1)
    expect(stdout).toBe('')
    expect(stderr.trim()).toBe('› Signed out\n› Run moi remote login to connect to Moi Cloud')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('profile names cannot inject terminal commands', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'moi-remote-terminal-'))
  const server = Bun.serve({
    port: 0,
    fetch(request) {
      return Response.json(
        new URL(request.url).pathname.endsWith('/me')
          ? { id: 'u1', name: '\x1b[31mHello\x1b[0m\nWorld', email: 'test@example.com' }
          : { workspaces: [] }
      )
    }
  })
  try {
    const url = server.url.origin + '/cloud'
    await Bun.write(join(directory, 'config.json'), JSON.stringify({ remote: { url } }))
    const jwt = `e30.${Buffer.from(JSON.stringify({ exp: Date.now() / 1000 + 3600 })).toString('base64url')}.signature`
    await Bun.write(
      join(directory, 'remote-auth.json'),
      JSON.stringify({ accessToken: jwt, refreshToken: 'unused', url, clientId: 'moi-cli' })
    )
    const child = Bun.spawn([process.execPath, join(import.meta.dir, '../../cli.ts'), 'remote'], {
      env: { ...Bun.env, MOI_DATA_DIR: directory, NO_COLOR: '1' },
      stdout: 'pipe',
      stderr: 'pipe'
    })
    const output = await new Response(child.stdout).text()
    expect(await child.exited).toBe(0)
    expect(output).toContain('HelloWorld <test@example.com>')
    expect(output).not.toContain('\x1b')
    expect(await new Response(child.stderr).text()).toBe('')
  } finally {
    server.stop(true)
    await rm(directory, { recursive: true, force: true })
  }
})

test('human CLI login, status, invitations, acceptance and logout', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'moi-human-commands-'))
  let accepted = false,
    revoked = false,
    sharedReads = 0
  const server = Bun.serve({
    port: 0,
    async fetch(request): Promise<Response> {
      const path = new URL(request.url).pathname
      if (path.endsWith('/device/code')) {
        const form = await request.formData()
        expect(String(form.get('scope'))).toContain('workspaces:access')
        return Response.json({
          device_code: 'device',
          user_code: 'ABCD',
          verification_uri_complete: server.url.origin + '/cloud/device?user_code=ABCD',
          expires_in: 30,
          interval: 1
        })
      }
      if (path.endsWith('/oauth2/token'))
        return Response.json({
          access_token: `e30.${Buffer.from(JSON.stringify({ exp: Date.now() / 1000 + 3600 })).toString('base64url')}.sig`,
          refresh_token: 'refresh'
        })
      if (path.endsWith('/oauth2/revoke')) {
        revoked = true
        return Response.json({})
      }
      expect(request.headers.get('authorization')).toStartWith('Bearer ')
      if (path.endsWith('/me'))
        return Response.json({ id: 'human', name: 'Alex', email: 'alex@example.com' })
      if (path.endsWith('/workspaces/shared')) {
        sharedReads++
        return Response.json({ workspaces: [] })
      }
      if (path.endsWith('/workspaces/invitations'))
        return Response.json({
          invitations: [
            {
              id: 'invite',
              workspaceId: 'board',
              workspaceName: 'Board',
              inviter: { id: 'owner', name: 'Owner', email: 'owner@example.com' },
              expiresAt: new Date(Date.now() + 60000).toISOString()
            }
          ]
        })
      if (path.endsWith('/invitations/invite/accept')) {
        accepted = true
        return Response.json({
          success: true,
          remote: { user_id: 'owner', workspace_id: 'board' },
          membershipId: 'member'
        })
      }
      return new Response(null, { status: 404 })
    }
  })
  try {
    await Bun.write(
      join(directory, 'config.json'),
      JSON.stringify({ remote: { url: server.url.origin + '/cloud' } })
    )
    async function cli(args: string[]) {
      const child = Bun.spawn(
        [process.execPath, join(import.meta.dir, '../../cli.ts'), 'remote', ...args],
        {
          env: { ...Bun.env, MOI_DATA_DIR: directory, NO_COLOR: '1' },
          stdout: 'pipe',
          stderr: 'pipe'
        }
      )
      const [code, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text()
      ])
      expect(code).toBe(0)
      expect(stderr).not.toContain('error:')
      return stdout
    }
    expect(await cli(['login', '--no-browser'])).toContain('Congratulations!')
    expect(JSON.parse(await cli(['--json'])).me.id).toBe('human')
    expect(JSON.parse(await cli(['invitations', '--json']))).toHaveLength(1)
    const beforeAcceptance = sharedReads
    expect(JSON.parse(await cli(['accept', 'invite', '--json'])).remote).toEqual({
      user_id: 'owner',
      workspace_id: 'board'
    })
    expect(await cli(['accept', 'invite'])).toContain('moi init --remote owner:board')
    expect(accepted).toBe(true)
    expect(sharedReads).toBe(beforeAcceptance)
    await cli(['logout'])
    expect(revoked).toBe(true)
    expect(await Bun.file(join(directory, 'remote-auth.json')).exists()).toBe(false)
  } finally {
    server.stop(true)
    await rm(directory, { recursive: true, force: true })
  }
})

test('invalid or unauthenticated acceptance leaves credentials untouched', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'moi-accept-signed-out-'))
  const { createRemoteClient } = await import('../../remote/client')
  const url = 'http://localhost:8787/cloud'
  try {
    await Bun.write(join(directory, 'config.json'), JSON.stringify({ remote: { url } }))
    const client = createRemoteClient(directory)
    for (const invite of ['invitation', `${url}/invite/id?token=${'A'.repeat(43)}`]) {
      await expect(client.accept(invite, 'Agent', 'other')).rejects.toThrow('remote login')
    }
    await expect(client.accept(`${url}/agent-invite/id?token=${'A'.repeat(43)}`)).rejects.toThrow(
      '--name and --client'
    )
    for (const invalid of ['Grok Bot', 'openclaw', 'unknown', ''])
      await expect(
        client.accept(`${url}/agent-invite/id?token=${'A'.repeat(43)}`, 'Agent', invalid)
      ).rejects.toThrow('Invalid client')
    expect(await Bun.file(join(directory, 'remote-auth.json')).exists()).toBe(false)
    expect(await Bun.file(join(directory, 'remote-agent-pending.json')).exists()).toBe(false)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
