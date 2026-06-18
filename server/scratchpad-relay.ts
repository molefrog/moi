import type { ScratchOp, ScratchOpResult } from '@/lib/types'

import { broadcastAll } from './state'

// Bridges `moi scratch` (control port) to a live tldraw editor in a browser tab.
// The control server runs in the same process as the app server, so it calls
// `relayScratchOp` directly: we broadcast the op over the app chat socket tagged
// with `workspaceId`, the tab showing that workspace's canvas runs it against
// tldraw, and replies with a `scratchpad:op-result` that settles our promise.

type Pending = {
  resolve: (result: ScratchOpResult) => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout>
}

const pendingOps = new Map<string, Pending>()
const RELAY_TIMEOUT_MS = 10_000

// Relay one op and await the first tab's reply. Rejects after a timeout when no
// tab answers — i.e. no tab is showing this workspace's Scratchpad. (Add ops
// must already carry a `name`, assigned by the caller, so execution is
// idempotent if more than one tab is open.)
export function relayScratchOp(workspaceId: string, op: ScratchOp): Promise<ScratchOpResult> {
  const opId = crypto.randomUUID()
  return new Promise<ScratchOpResult>((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingOps.delete(opId)
      reject(new Error('No live canvas — open the Scratchpad tab for this workspace.'))
    }, RELAY_TIMEOUT_MS)
    pendingOps.set(opId, { resolve, reject, timer })
    broadcastAll({ type: 'scratchpad:op', workspaceId, opId, op })
  })
}

// Settle a pending relay from a tab's reply. A second tab answering the same op
// (or any late/unknown reply) finds no entry and is ignored — first reply wins.
export function resolveScratchOp(opId: string, result?: ScratchOpResult, error?: string): void {
  const pending = pendingOps.get(opId)
  if (!pending) return
  pendingOps.delete(opId)
  clearTimeout(pending.timer)
  if (error) pending.reject(new Error(error))
  else pending.resolve(result ?? { ok: true })
}
