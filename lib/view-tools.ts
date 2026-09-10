export type ViewToolRequest =
  | {
      type: 'view-tool:call'
      requestId: string
      workspaceId: string
      viewId: string
      name: string
      args: Record<string, unknown>
    }
  | {
      type: 'view-tool:list'
      requestId: string
      workspaceId: string
      viewId: string
    }

export type ViewToolEvent = ViewToolRequest | { type: 'view-tool:cancel'; requestId: string }
export const VIEW_TOOL_TIMEOUT_MS = 30_000
