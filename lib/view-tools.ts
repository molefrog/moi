export type ViewToolRequest = {
  type: 'view-tool:call'
  requestId: string
  workspaceId: string
  viewId: string
  name: string
  args: Record<string, unknown>
}

export type ViewToolEvent = ViewToolRequest | { type: 'view-tool:cancel'; requestId: string }
export const VIEW_TOOL_TIMEOUT_MS = 30_000
