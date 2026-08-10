import { afterAll, expect, test } from 'bun:test'

import { CONTROL_HOST } from './constants'
import { controlFailureMessage, probeControlServer } from './control-client'

// A stand-in control server: same shape as `control.ts` (upgrade or 426), on an
// ephemeral port so the test never collides with a real `moi start`.
const server = Bun.serve({
  port: 0,
  hostname: CONTROL_HOST,
  fetch: (req, s) =>
    s.upgrade(req) ? new Response(null, { status: 101 }) : new Response('', { status: 426 }),
  websocket: { message() {} }
})

afterAll(() => server.stop(true))

test('reports a listening control server as running', async () => {
  expect(await probeControlServer({ port: server.port })).toEqual({ status: 'running' })
})

test('reports an empty port as not-running, not as unreachable', async () => {
  const free = Bun.serve({ port: 0, hostname: CONTROL_HOST, fetch: () => new Response('') })
  const port = free.port
  free.stop(true)

  expect(await probeControlServer({ port })).toEqual({ status: 'not-running' })
})

test('an unresolvable host is unreachable, not "no server running"', async () => {
  const probe = await probeControlServer({
    host: 'moi-control-does-not-resolve.invalid',
    port: server.port
  })

  expect(probe.status).toBe('unreachable')
  if (probe.status !== 'unreachable') throw new Error('unreachable')
  expect(probe.reason).toContain('could not resolve')
})

test('a port held by a non-WebSocket listener is unreachable', async () => {
  const plain = Bun.serve({ port: 0, hostname: CONTROL_HOST, fetch: () => new Response('nope') })

  const probe = await probeControlServer({ port: plain.port })
  plain.stop(true)

  expect(probe.status).toBe('unreachable')
  if (probe.status !== 'unreachable') throw new Error('unreachable')
  expect(probe.reason).toContain('another process may hold it')
})

test('failure messages distinguish an absent server from an unreachable one', () => {
  expect(controlFailureMessage({ status: 'not-running' })).toContain('Is the main process running?')

  const unreachable = controlFailureMessage({
    status: 'unreachable',
    reason: 'could not resolve "x"'
  })
  expect(unreachable).toContain('could not resolve "x"')
  expect(unreachable).toContain('may still be running')
})
