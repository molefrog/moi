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
