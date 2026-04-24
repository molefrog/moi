import type { StreamEvent } from './format'

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
  | {
      type: 'chat'
      content: string
      sessionId: string
      isNew: boolean
      // Client-chosen stable id for the user's turn. The server tells the
      // adapter to use this id when the SDK echoes the user input back, so
      // the optimistic bubble the client rendered gets upserted in place.
      optimisticId?: string
    }
  | { type: 'stop'; sessionId: string }

// Session info returned by list endpoint
export type SessionInfo = {
  sessionId: string
  summary: string
  lastModified: number
  cwd?: string
}

// Re-export the display format
export type {
  Citation,
  Part,
  ResultSummary,
  SessionSnapshot,
  StreamEvent,
  SubagentRecord,
  SubagentStatus,
  SystemNotice,
  ToolCall,
  ToolCaller,
  ToolState,
  Turn,
  TurnOrigin,
  ViewState
} from './format'

// Server → Client messages.
// Every conversation-related frame carries a sessionId so the client can
// route it to the correct session.
export type ServerMessage =
  | (StreamEvent & { sessionId: string })
  | StatusMessage
  | SessionRenamedMessage
  | WorkspaceSwitchMessage
  | ErrorFrame
  | StoppedFrame

export type WorkspaceSwitchMessage = {
  type: 'workspace:switch'
  workspaceId: string
}

export type WorkspaceEntry = {
  id: string
  path: string
  addedAt: string
}

export type SessionRenamedMessage = {
  type: 'session_renamed'
  from: string
  to: string
}

export type ErrorFrame = {
  kind: 'error'
  sessionId: string
  content: string
}

export type StoppedFrame = {
  kind: 'stopped'
  sessionId: string
}

export type StatusMessage = {
  type: 'status'
  sessionId: string
  processing: boolean
}

// Workspace layout persistence
export type LayoutGridItem = { i: string; x: number; y: number }

export type ChatMode = 'sidebar' | 'floating'

export type { FontTheme, ColorTheme } from './themes'

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
