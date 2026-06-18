import type { ScratchOp, ScratchOpResult } from '@/lib/types'

// A live Scratchpad editor registers an executor here while it's mounted, keyed
// by workspace id. The chat-socket frame handler (connection.ts) looks one up
// when a `scratchpad:op` arrives and runs it against the tab's tldraw editor.
// Only the tab actually showing a workspace's canvas has an entry, so ops from
// `moi scratch` reach the right editor (and no-op everywhere else).

type ScratchExecutor = (op: ScratchOp) => Promise<ScratchOpResult>

const executors = new Map<string, ScratchExecutor>()

export function setScratchExecutor(workspaceId: string, fn: ScratchExecutor | null) {
  if (fn) executors.set(workspaceId, fn)
  else executors.delete(workspaceId)
}

export function getScratchExecutor(workspaceId: string): ScratchExecutor | undefined {
  return executors.get(workspaceId)
}
