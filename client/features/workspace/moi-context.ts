// Central assembly of the moi context sent with every chat message — the one
// place that snapshots the workspace's primary UI state (active tab, view
// titles) and drains queued one-shot directives. The structured `MoiContext`
// travels to the server as-is; harnesses render it (lib/moi-context.ts).
//
// Quick API:
//
//   pushChatDirective(workspaceId, 'The user clicked "Sync now" on the stock-ticker widget.')
//     Queue a one-shot instruction from anywhere in the app — event handlers,
//     stores, non-React code. It rides the NEXT chat message's
//     "# This message only" section and is delivered exactly once.
//
//   useMoiContext()
//     Hook for the chat send path: returns a builder that snapshots ambient
//     state (active tab, view title) and drains the directive queue. Call
//     the builder only for a message that actually goes out.
//
//   Adding a new ambient field (e.g. scratchpad selection): extend the
//   `MoiContext` type and its renderer in lib/moi-context.ts, then supply
//   the field in `useMoiContext`'s builder below.
import { useCallback } from 'react'

import { useWorkspaceViews } from '@/client/features/workspace/api'
import { useWorkspaceId } from '@/client/features/workspace/WorkspaceContext'
import { useWorkspaceLayoutCtx } from '@/client/features/workspace/WorkspaceLayoutContext'
import type { MoiContext } from '@/lib/moi-context'
import type { ViewInfo, WorkspaceTabId } from '@/lib/types'

// One-shot directives queued per workspace, drained into the NEXT chat
// message's `# This message only` section. Module-level (not React state):
// contributors may not live under a workspace React tree, and the queue must
// survive re-renders without causing any.
const directiveQueues = new Map<string, string[]>()

// Queue a one-shot instruction for the next message sent from `workspaceId`.
// Write a complete sentence; it reaches the agent once and is not re-sent.
export function pushChatDirective(workspaceId: string, directive: string): void {
  const queue = directiveQueues.get(workspaceId) ?? []
  queue.push(directive)
  directiveQueues.set(workspaceId, queue)
}

// Exported for unit tests; production code drains only via `useMoiContext`.
export function drainChatDirectives(workspaceId: string): string[] {
  const queue = directiveQueues.get(workspaceId) ?? []
  directiveQueues.delete(workspaceId)
  return queue
}

// The configured title of the active view tab, undefined for other tabs or
// an unset title (the envelope then falls back to the id, like the tab bar).
export function activeViewTitle(
  tab: WorkspaceTabId,
  views: ViewInfo[] | undefined
): string | undefined {
  if (!tab.startsWith('view:')) return undefined
  return views?.find(v => v.id === tab.slice('view:'.length))?.config.title || undefined
}

// Returns a builder that snapshots the workspace state at call time — invoke
// it when the message is actually sent, not at render. Draining the
// directive queue is part of the snapshot, so only call it for a message
// that will really go out.
export function useMoiContext(): () => MoiContext {
  const workspaceId = useWorkspaceId()
  const { layout } = useWorkspaceLayoutCtx()
  const views = useWorkspaceViews(workspaceId).data
  const activeTab = layout.tabs.active
  return useCallback(() => {
    const directives = drainChatDirectives(workspaceId)
    return {
      activeTab,
      tabTitle: activeViewTitle(activeTab, views),
      ...(directives.length > 0 ? { directives } : {})
    }
  }, [workspaceId, activeTab, views])
}
