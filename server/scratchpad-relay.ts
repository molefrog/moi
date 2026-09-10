import type { ScratchOp, ScratchOpResult } from '@/lib/types'

import { broadcastAll } from './state'

// Bridges the built-in `render_canvas` tool to a live tldraw editor in a browser
// tab. We broadcast the op over the app chat socket tagged with `workspaceId`;
// the tab showing that workspace's canvas runs it against tldraw and replies
// with a `scratchpad:op-result` that settles the tool call.

type Pending = {
  finish: (error?: Error, result?: ScratchOpResult) => void
}

const pendingOps = new Map<string, Pending>()
const RELAY_TIMEOUT_MS = 10_000

// Relay one op and await the first tab's reply. Rejects after a timeout when no
// tab answers — i.e. no tab is showing this workspace's Scratchpad.
export function relayScratchOp(
  workspaceId: string,
  op: ScratchOp,
  signal?: AbortSignal
): Promise<ScratchOpResult> {
  const opId = crypto.randomUUID()
  return new Promise<ScratchOpResult>((resolve, reject) => {
    const abort = () => finish(new Error('Tool call cancelled. State may already have changed.'))
    const timer = setTimeout(() => {
      finish(new Error('No live canvas — open the Scratchpad tab for this workspace.'))
    }, RELAY_TIMEOUT_MS)
    const finish = (error?: Error, result?: ScratchOpResult) => {
      if (!pendingOps.delete(opId)) return
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      if (error) reject(error)
      else resolve(result ?? { ok: true })
    }
    pendingOps.set(opId, { finish })
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) return abort()
    broadcastAll({ type: 'scratchpad:op', workspaceId, opId, op })
  })
}

// Settle a pending relay from a tab's reply. A second tab answering the same op
// (or any late/unknown reply) finds no entry and is ignored — first reply wins.
export function resolveScratchOp(opId: string, result?: ScratchOpResult, error?: string): void {
  const pending = pendingOps.get(opId)
  if (!pending) return
  pending.finish(error ? new Error(error) : undefined, result)
}
