import type { WorkspaceEntry, WorkspaceState } from '@/lib/types'

export const WORKSPACE_STATE_VERSION = 1

// What the store needs to find a workspace's file and stamp its folder path.
export type WorkspaceRef = Pick<WorkspaceEntry, 'id' | 'path'>

// `state.json` on disk: the state clients see, plus the file format version
// and the folder it belongs to. Chat titles and history stay in each
// harness's transcripts.
export type StoredWorkspaceState = WorkspaceState & {
  version: typeof WORKSPACE_STATE_VERSION
  // A re-added workspace (new registration) finds its old id through it, and
  // startup prunes state for deleted folders.
  workspacePath: string
}
