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
//   useMoiUserMessageContext({ activeTab, appletParams })
//     Hook for the chat send path: takes the workspace's live tab address
//     (from useWorkspaceNavigation, threaded through useChat) and returns a
//     builder that resolves the tab's title and params, drains the directive
//     queue, and accepts per-message extras — directives, and the applet
//     attribution when the message came from applet UI rather than the
//     composer. Call the builder only for a message that actually goes out.
//
//   Adding a new ambient field (e.g. scratchpad selection): extend the
//   `MoiContext` type and its renderer in lib/moi-context.ts, then supply
//   the field in `useMoiUserMessageContext`'s builder below.
import { useCallback } from 'react'

import { useViewBuilders } from '@/client/features/views/api'
import { useWorkspaceViews } from '@/client/features/workspace/api'
import { useWorkspaceId } from '@/client/features/workspace/WorkspaceContext'
import type { MoiAppletMessage, MoiContext } from '@/lib/moi-context'
import type { ViewBuilder, ViewInfo, WorkspaceTabId } from '@/lib/types'

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

// Exported for unit tests; production code drains only via `useMoiUserMessageContext`.
export function drainChatDirectives(workspaceId: string): string[] {
  const queue = directiveQueues.get(workspaceId) ?? []
  directiveQueues.delete(workspaceId)
  return queue
}

// Drain queued directives and append instructions explicitly attached to the
// message being sent. Keeping the latter out of the queue ties them to that
// exact send while preserving queued directives from other UI actions.
export function takeChatDirectives(
  workspaceId: string,
  messageDirectives: readonly string[] = []
): string[] {
  return [...drainChatDirectives(workspaceId), ...messageDirectives]
}

// The workspace's live tab address, owned by useWorkspaceNavigation and passed
// down through useChat. The URL is the truth for which tab is active, and
// navigation state is the truth for what the view is rendering with.
export type WorkspaceTabAddress = {
  activeTab: WorkspaceTabId
  appletParams: Record<string, unknown>
}

// The params the envelope should report, or undefined when there are none
// worth reporting: views are the only tabs with addressable state, and an
// empty record says nothing.
export function envelopeTabParams(
  activeTab: WorkspaceTabId,
  appletParams: Record<string, unknown>
): Record<string, unknown> | undefined {
  if (!activeTab.startsWith('view:')) return undefined
  return Object.keys(appletParams).length > 0 ? appletParams : undefined
}

// The UI label of the active tab when it has one beyond its id: a view's
// configured title, or a builder's claimed title while the build runs.
// Undefined otherwise (the envelope then falls back to the id, like the tab
// bar).
export function activeTabTitle(
  tab: WorkspaceTabId,
  views: ViewInfo[] | undefined,
  builders: ViewBuilder[] | undefined
): string | undefined {
  if (tab.startsWith('view:'))
    return views?.find(v => v.id === tab.slice('view:'.length))?.config.title || undefined
  if (tab.startsWith('view-builder:'))
    return builders?.find(b => b.id === tab.slice('view-builder:'.length))?.title || undefined
  return undefined
}

// Per-message extras the send path supplies — everything else in the envelope
// is ambient state the builder snapshots for itself.
export type MoiUserMessageOptions = {
  directives?: readonly string[]
  // Present when applet UI sent this message instead of the user typing it.
  applet?: MoiAppletMessage
}

// Returns a builder that snapshots the workspace state at call time — invoke
// it when the message is actually sent, not at render. Draining the
// directive queue is part of the snapshot, so only call it for a message
// that will really go out.
export function useMoiUserMessageContext({
  activeTab,
  appletParams
}: WorkspaceTabAddress): (options?: MoiUserMessageOptions) => MoiContext {
  const workspaceId = useWorkspaceId()
  const views = useWorkspaceViews(workspaceId).data
  const builders = useViewBuilders(workspaceId).data
  return useCallback(
    (options: MoiUserMessageOptions = {}) => {
      const directives = takeChatDirectives(workspaceId, options.directives ?? [])
      const tabParams = envelopeTabParams(activeTab, appletParams)
      return {
        activeTab,
        tabTitle: activeTabTitle(activeTab, views, builders),
        ...(tabParams ? { tabParams } : {}),
        ...(options.applet ? { applet: options.applet } : {}),
        ...(directives.length > 0 ? { directives } : {})
      }
    },
    [workspaceId, activeTab, appletParams, views, builders]
  )
}
