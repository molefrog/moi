export type WidgetConfig = {
  rowSpan: 1 | 2 | 3 | 4
  colSpan: 1 | 2 | 3 | 4
}

export type WidgetInfo = {
  id: string
  config: WidgetConfig
}

// Client → Server messages
export type ClientMessage =
  | { type: 'chat'; content: string; sessionId: string; isNew: boolean }
  | { type: 'stop'; sessionId: string }

// Session info returned by list endpoint
export type SessionInfo = {
  sessionId: string
  summary: string
  lastModified: number
  cwd?: string
}

// Persistable message (stored in messages.json)
export type ChatMessage =
  | UserMessage
  | AssistantMessage
  | ToolUseMessage
  | ToolResultMessage
  | DoneMessage
  | ErrorMessage
  | StoppedMessage

// Server → Client messages — everything is tagged with sessionId
export type ServerMessage =
  | (ChatMessage & { sessionId: string })
  | StatusMessage
  | SessionRenamedMessage

export type SessionRenamedMessage = {
  type: 'session_renamed'
  from: string
  to: string
}

export type UserMessage = {
  type: 'user'
  content: string
}

export type AssistantMessage = {
  type: 'assistant'
  content: string
}

export type ToolUseMessage = {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, unknown>
}

export type ToolResultMessage = {
  type: 'tool_result'
  tool_use_id: string
  content: string
  is_error: boolean
}

export type DoneMessage = {
  type: 'done'
  cost: number
  turns: number
  session_id: string
}

export type ErrorMessage = {
  type: 'error'
  content: string
}

export type StoppedMessage = {
  type: 'stopped'
}

export type StatusMessage = {
  type: 'status'
  sessionId: string
  processing: boolean
}

// Workspace layout persistence
export type LayoutGridItem = { i: string; x: number; y: number }

export type ChatMode = 'sidebar' | 'floating'

export type { FontTheme } from './themes'

export type WorkspaceLayout = {
  version: 1
  widgetGrid: LayoutGridItem[]
  chatMode: ChatMode
  theme?: {
    font: import('./themes').FontTheme
    background?: string
    foreground?: string
  }
}
