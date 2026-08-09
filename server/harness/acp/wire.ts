// ACP (Agent Client Protocol) wire types — layer 1 for every ACP-speaking
// backend. The shapes come from the official `@agentclientprotocol/sdk`, whose
// types are generated from the protocol's JSON Schema, so this file only
// re-exports them under moi's naming and adds the few things the spec does not
// (yet) cover.
//
// The SDK is a **types-only, dev-only** dependency: `dist/schema/types.gen.js`
// contains no runtime code, and importing values instead (`AGENT_METHODS`,
// `ClientSideConnection`, …) would pull in zod as a real dependency for the
// sake of a handful of string constants. Method names below were verified
// against the SDK's `AGENT_METHODS` / `CLIENT_METHODS` at 1.3.0.
//
// ⚠️ Version skew: the shipped agent (Hermes 0.20.0) implements an OLDER
// revision of ACP than the SDK describes — it pins Python
// `agent-client-protocol==0.9.0`, which still has a first-class *model*
// concept. The spec dropped `session/set_model` and `models.availableModels`
// after `@zed-industries/agent-client-protocol@0.4.5` and replaced them with
// `session/set_config_option`. Everything under "pre-1.0 additions" below is
// that gap; delete it once agents move to config options. See
// ../hermes/NOTES.md §12.
//
// Nothing in this folder is Hermes-specific.

import type {
  AgentCapabilities,
  ContentBlock,
  ContentChunk,
  InitializeResponse,
  ListSessionsResponse,
  NewSessionResponse,
  PermissionOption,
  PromptResponse,
  RequestPermissionRequest,
  SessionInfo as AcpSessionInfoRow,
  SessionModeState,
  SessionNotification,
  SessionUpdate,
  StopReason,
  ToolCall,
  ToolCallContent,
  ToolCallLocation,
  ToolCallStatus,
  ToolCallUpdate,
  ToolKind,
  Usage
} from '@agentclientprotocol/sdk'

export type {
  AgentCapabilities,
  ContentBlock,
  ContentChunk,
  InitializeResponse,
  ListSessionsResponse,
  PermissionOption,
  PromptResponse,
  RequestPermissionRequest,
  SessionModeState,
  SessionNotification,
  SessionUpdate,
  StopReason,
  ToolCall,
  ToolCallContent,
  ToolCallLocation,
  ToolCallStatus,
  ToolCallUpdate,
  ToolKind,
  Usage
}

// `session/list` rows. Aliased because moi has its own `SessionInfo` in
// lib/types.ts and the two are different things (this one is the wire row).
export type AcpSessionListEntry = AcpSessionInfoRow

// The prompt request's content blocks. `ContentBlock` is the full union
// (text | image | audio | resource_link | resource); moi only ever sends the
// first two, and narrowing here keeps the send path honest.
export type AcpPromptBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; mimeType: string; data: string }

// ---------------------------------------------------------------------------
// pre-1.0 additions — see the version-skew note in the file header
// ---------------------------------------------------------------------------

// Model selection, as it existed before the spec replaced it with session
// config options. Hermes returns this inline on `session/new` and answers
// `session/set_model`.
export type AcpModelInfo = {
  modelId: string
  name?: string
  description?: string
}

export type AcpModelState = {
  availableModels?: AcpModelInfo[]
  currentModelId?: string
}

// `NewSessionResponse` plus the dropped `models` field.
export type AcpNewSessionResult = NewSessionResponse & { models?: AcpModelState | null }

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

export function isTextBlock(
  block: ContentBlock | undefined
): block is ContentBlock & { type: 'text'; text: string } {
  return !!block && block.type === 'text' && typeof (block as { text?: unknown }).text === 'string'
}

// The text of a chunk update, or '' for a non-text block (moi renders images
// from its own upload store, not from the echo).
export function chunkText(update: SessionUpdate): string {
  const content = (update as Partial<ContentChunk>).content
  return isTextBlock(content) ? content.text : ''
}

// Flatten a tool call's content array into displayable text. `diff` entries
// render as their new text — the tool card shows the path separately.
export function toolContentToText(content: ToolCallContent[] | null | undefined): string {
  if (!content?.length) return ''
  const out: string[] = []
  for (const entry of content) {
    if (entry.type === 'content' && isTextBlock(entry.content)) {
      out.push(entry.content.text)
    } else if (entry.type === 'diff' && typeof entry.newText === 'string') {
      out.push(entry.newText)
    }
  }
  return out.join('\n')
}
