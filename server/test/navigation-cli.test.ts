import { expect, test } from 'bun:test'
import { join } from 'node:path'

const CLI = join(import.meta.dir, '..', 'cli.ts')

test('navigation CLI sends a portable address and waits for a matching response', async () => {
  let request: unknown
  const server = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch(req, server) {
      if (server.upgrade(req)) return
      return new Response('', { status: 400 })
    },
    websocket: {
      message(ws, message) {
        request = JSON.parse(String(message))
        ws.send(JSON.stringify({ ok: true, href: 'moi:/overview' }))
      }
    }
  })
  try {
    const proc = Bun.spawn(['bun', CLI, 'navigate', 'moi:/overview'], {
      env: { ...process.env, MOI_CONTROL_PORT: String(server.port) },
      stdout: 'pipe',
      stderr: 'pipe'
    })
    const [output, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited])
    expect(request).toMatchObject({ type: 'navigate', href: 'moi:/overview' })
    expect(request).not.toHaveProperty('replace')
    expect(code).toBe(0)
    expect(output).toContain('Navigated to moi:/overview')
  } finally {
    server.stop(true)
  }
})

test('navigation CLI exits nonzero when the control server disconnects without acknowledgement', async () => {
  const server = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch(req, server) {
      if (server.upgrade(req)) return
      return new Response('', { status: 400 })
    },
    websocket: {
      message(ws) {
        ws.close()
      }
    }
  })
  try {
    const proc = Bun.spawn(['bun', CLI, 'navigate', 'moi:/overview'], {
      env: { ...process.env, MOI_CONTROL_PORT: String(server.port) },
      stdout: 'pipe',
      stderr: 'pipe'
    })
    const [error, code] = await Promise.all([new Response(proc.stderr).text(), proc.exited])
    expect(code).toBe(1)
    expect(error).toContain('disconnected before acknowledging')
  } finally {
    server.stop(true)
  }
})
