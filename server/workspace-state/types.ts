import type { PendingView, SessionConfig, WorkspaceEntry, WorkspaceTabId } from '@/lib/types'

export const WORKSPACE_STATE_VERSION = 1

// What the store needs to find a workspace's file and stamp its folder path.
export type WorkspaceRef = Pick<WorkspaceEntry, 'id' | 'path'>

// Moi's own per-user state for one workspace: which chat each tab shows, the
// pin, per-chat settings, and views still being built. Chat titles and history
// stay in each harness's transcripts.
export type WorkspaceState = {
  version: typeof WORKSPACE_STATE_VERSION
  // The folder this state belongs to. A re-added workspace (new registration)
  // finds its old id through it, and startup prunes state for deleted folders.
  workspacePath: string
  // Applies to every tab and overrides `selected`.
  pinnedSessionId?: string
  // The chat each tab last showed. Collab keeps its per-browser choice in
  // sessionStorage; this is the shared one.
  selected: Partial<Record<WorkspaceTabId, string>>
  sessions: Record<string, WorkspaceSessionState>
  // Views not compiled yet, keyed by view id. A compiled view lives in
  // `.moi/views/` and its entry is removed.
  pendingViews: Record<string, PendingViewState>
}

export type WorkspaceSessionState = {
  // The view tab that owns this chat; absent means the overview.
  tabId?: WorkspaceTabId
  // Per-chat overrides of the workspace defaults in `.moi/.workspace.json`.
  config?: SessionConfig
  fork?: SessionFork
}

export type SessionFork = {
  fromSessionId: string
  // Last copied turn in the child. Without a cutoff, show its full history.
  throughMessageId?: string
  noticeIds?: string[]
}

export type PendingViewState = Omit<PendingView, 'id' | 'executionSessionId'> & {
  // The chat running the build. Usually the view tab's own chat; the pinned
  // chat when one is pinned, which keeps its own tab.
  buildSessionId?: string
}
