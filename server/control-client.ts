import { connect } from 'node:net'

import { CONTROL_HOST, CONTROL_PORT, CONTROL_URL } from './constants'

// Why the CLI probes the control port instead of just asking "did the socket
// open?": a failed dial has more than one cause, and they need different
// answers. Nothing listening means the server is not running (`moi start`).
// Anything else — the name or address not resolving, the host unreachable, a
// stranger squatting on the port — means the server may well be running and
// fine, and the fix is not to restart it. Bun's WebSocket collapses all of
// these into a single "Failed to connect" error, so the classification is
// recovered with a second probe at the TCP layer, where the real errno
// survives (`node:net` reports it; `Bun.connect` reports ECONNREFUSED for
// everything, so it cannot be used here).

export type ControlProbe =
  // A control socket opened — the server is up.
  | { status: 'running' }
  // Connection refused: the port is free, so no server is listening.
  | { status: 'not-running' }
  // Anything else. `reason` names the actual failure for the user.
  | { status: 'unreachable'; reason: string }

export type ControlProbeOptions = {
  host?: string
  port?: number
  timeoutMs?: number
}

function closeQuietly(ws: WebSocket): void {
  try {
    ws.close()
  } catch {}
}

// Re-dial the same address at the TCP layer to recover the errno the WebSocket
// error swallowed. Reaching this means the WebSocket already failed, so a
// successful TCP connect is itself a finding: something holds the control port
// but does not speak our protocol.
function classifyDialFailure(host: string, port: number, timeoutMs: number): Promise<ControlProbe> {
  return new Promise(resolve => {
    let settled = false
    const settle = (probe: ControlProbe) => {
      if (settled) return
      settled = true
      resolve(probe)
    }
    const socket = connect({ host, port })
    socket.setTimeout(timeoutMs)
    socket.on('connect', () => {
      socket.destroy()
      settle({
        status: 'unreachable',
        reason:
          'the port accepted a connection but refused the control WebSocket — another process may hold it'
      })
    })
    socket.on('timeout', () => {
      socket.destroy()
      settle({ status: 'unreachable', reason: `no answer within ${timeoutMs}ms` })
    })
    socket.on('error', (err: NodeJS.ErrnoException) => {
      socket.destroy()
      if (err.code === 'ECONNREFUSED') {
        settle({ status: 'not-running' })
        return
      }
      if (err.code === 'ENOTFOUND' || err.code === 'EAI_AGAIN') {
        settle({ status: 'unreachable', reason: `could not resolve "${host}" (${err.code})` })
        return
      }
      settle({
        status: 'unreachable',
        reason: err.code ?? err.message
      })
    })
  })
}

// Open a control socket and report what happened. The happy path is one
// WebSocket connect; the extra TCP probe only runs when that fails.
export function probeControlServer(options: ControlProbeOptions = {}): Promise<ControlProbe> {
  const { host = CONTROL_HOST, port = CONTROL_PORT, timeoutMs = 1500 } = options
  const url = host === CONTROL_HOST && port === CONTROL_PORT ? CONTROL_URL : `ws://${host}:${port}`
  return new Promise(resolve => {
    let settled = false
    const settle = (probe: ControlProbe) => {
      if (settled) return
      settled = true
      resolve(probe)
    }
    let ws: WebSocket
    try {
      ws = new WebSocket(url)
    } catch (err) {
      settle({ status: 'unreachable', reason: err instanceof Error ? err.message : String(err) })
      return
    }
    const timer = setTimeout(() => {
      closeQuietly(ws)
      // A hung dial is not evidence of an absent server — say so rather than
      // reporting it as "not running" the way a bare timeout used to.
      void classifyDialFailure(host, port, timeoutMs).then(settle)
    }, timeoutMs)
    ws.onopen = () => {
      clearTimeout(timer)
      closeQuietly(ws)
      settle({ status: 'running' })
    }
    ws.onerror = () => {
      clearTimeout(timer)
      void classifyDialFailure(host, port, timeoutMs).then(settle)
    }
  })
}

// The one-line explanation the CLI prints when a command could not reach the
// control server. `running` never reaches here.
export function controlFailureMessage(probe: ControlProbe): string {
  if (probe.status === 'unreachable') {
    return `Could not reach the control server at ${CONTROL_HOST}:${CONTROL_PORT} — ${probe.reason}. The server may still be running.`
  }
  return 'Could not connect to control server. Is the main process running?'
}
