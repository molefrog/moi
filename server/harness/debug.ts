// Shared debug taps for the /playground/harness page.
//
// Two channels of ring buffers, kept module-global so they survive session
// teardowns and process-client restarts:
//   - wire:   the harness's native protocol frames, per backend scope
//             (Codex: JSON-RPC frames keyed by workspacePath; Claude Code:
//             raw SDK messages keyed by workspaceId).
//   - client: every frame `broadcast()` pushes to chat clients, keyed by
//             workspaceId — provider-agnostic, tapped in state.ts.
//
// Read by GET /api/workspaces/:id/harness/debug with `seq` cursors so the
// page can poll deltas.

export type DebugFrame = {
  seq: number
  ts: number
  // 'send' = moi → harness (wire) / n.a. (client); 'recv' = harness → moi.
  dir: 'send' | 'recv'
  frame: unknown
}

const RING_CAP = 1000
let seq = 0

const logs = new Map<string, DebugFrame[]>() // key: `${channel}:${scope}`

function tap(channel: 'wire' | 'client', scope: string, dir: 'send' | 'recv', frame: unknown) {
  const key = `${channel}:${scope}`
  let log = logs.get(key)
  if (!log) {
    log = []
    logs.set(key, log)
  }
  log.push({ seq: ++seq, ts: Date.now(), dir, frame })
  if (log.length > RING_CAP) log.splice(0, log.length - RING_CAP)
}

function read(channel: 'wire' | 'client', scope: string, sinceSeq: number): DebugFrame[] {
  const log = logs.get(`${channel}:${scope}`) ?? []
  return sinceSeq > 0 ? log.filter(f => f.seq > sinceSeq) : log
}

export function tapWire(scope: string, dir: 'send' | 'recv', frame: unknown): void {
  tap('wire', scope, dir, frame)
}

export function getWireLog(scope: string, sinceSeq = 0): DebugFrame[] {
  return read('wire', scope, sinceSeq)
}

export function tapClientFrame(workspaceId: string, frame: unknown): void {
  tap('client', workspaceId, 'send', frame)
}

export function getClientFrameLog(workspaceId: string, sinceSeq = 0): DebugFrame[] {
  return read('client', workspaceId, sinceSeq)
}
