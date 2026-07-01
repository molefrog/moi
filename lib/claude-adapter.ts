import type {
  AdapterEmit,
  Part,
  PreviewBlock,
  ResultSummary,
  SessionSnapshot,
  StreamEvent,
  SubagentRecord,
  SystemNotice,
  ToolCall,
  ToolCaller,
  Turn,
  TurnMeta,
  TurnOrigin
} from './format'

import { ATTACHMENT_ONLY_PLACEHOLDER, splitAttachmentNote } from './attachment-note'

// Loose SDK message shape — we don't pull in the full SDK type tree; the
// adapter tolerates missing fields. Reference: dev/sdk-message-spec.md.
type ContentBlock = {
  type: string
  text?: string
  thinking?: string
  signature?: string
  data?: string
  name?: string
  id?: string
  input?: Record<string, unknown>
  tool_use_id?: string
  content?: unknown
  is_error?: boolean
  server_name?: string
  url?: string
  title?: string
  media_type?: string
  filename?: string
  source_id?: string
  // Image/document blocks carry their payload here (base64) or as a bare `url`.
  source?: {
    type?: string
    media_type?: string
    data?: string
    url?: string
  }
}

// A raw Anthropic Messages-API SSE event, as forwarded by the SDK's
// `stream_event` messages (only when `includePartialMessages` is on). Loosely
// typed — we read just the fields we render. `message.id` is present only on
// `message_start`; the block deltas carry `index` but no message id, so we
// track the active message per lane (see `currentMsgByParent`).
type RawStreamEvent = {
  type?: string
  message?: { id?: string }
  index?: number
  content_block?: { type?: string; text?: string; thinking?: string }
  delta?: { type?: string; text?: string; thinking?: string }
}

type SdkMessage = {
  type: string
  subtype?: string
  message?: { role?: string; content?: unknown; model?: string; id?: string }
  event?: RawStreamEvent
  parent_tool_use_id?: string | null
  tool_use_id?: string
  isSynthetic?: boolean
  isReplay?: boolean
  tool_use_result?: unknown
  uuid?: string
  session_id?: string
  timestamp?: string
  tools?: string[]
  mcp_servers?: { name: string; status: string }[]
  model?: string
  permissionMode?: string
  cwd?: string
  plugins?: { name: string; path: string }[]
  skills?: string[]
  slash_commands?: string[]
  agents?: string[]
  task_id?: string
  description?: string
  status?: string
  usage?: { total_tokens?: number; tool_uses?: number; duration_ms?: number }
  hook_id?: string
  hook_name?: string
  hook_event?: string
  stdout?: string
  stderr?: string
  output?: string
  exit_code?: number
  outcome?: string
  attempt?: number
  max_retries?: number
  retry_delay_ms?: number
  error?: unknown
  compact_metadata?: unknown
  files?: { filename: string; file_id?: string; error?: string }[]
  failed?: { filename: string; error: string }[]
  mcp_server_name?: string
  elicitation_id?: string
  rate_limit_info?: unknown
  duration_ms?: number
  num_turns?: number
  total_cost_usd?: number
  state?: string
}

function contentAsArray(content: unknown): ContentBlock[] {
  if (Array.isArray(content)) return content as ContentBlock[]
  if (typeof content === 'string') return [{ type: 'text', text: content }]
  return []
}

function blockOutputText(block: ContentBlock, max = 4000): string {
  if (typeof block.content === 'string') return block.content.slice(0, max)
  if (Array.isArray(block.content)) {
    return (block.content as ContentBlock[])
      .filter(b => b.type === 'text')
      .map(b => b.text ?? '')
      .join('\n')
      .slice(0, max)
  }
  return ''
}

function callerFromBlockType(type: string, name: string): ToolCaller {
  if (name === 'Agent') return 'subagent'
  if (type === 'server_tool_use') return 'server-tool'
  if (type === 'mcp_tool_use') return 'mcp'
  return 'model'
}

function classifySyntheticReason(
  firstText: string
): Exclude<Extract<TurnOrigin, { kind: 'synthetic' }>['reason'], never> {
  if (/<system-reminder>/i.test(firstText)) return 'system-reminder'
  return 'other'
}

let _noticeSeq = 0
function noticeId(prefix: string): string {
  _noticeSeq++
  return `${prefix}:${Date.now()}:${_noticeSeq}`
}

function turnId(msg: SdkMessage): string {
  if (msg.uuid) return msg.uuid
  return `fallback:${Math.random().toString(36).slice(2)}`
}

// Lane key for the top-level (non-subagent) assistant stream. Deltas carry no
// message id, so we key "which message is currently streaming" by lane —
// `parent_tool_use_id` for a subagent, this sentinel for the root.
const ROOT_LANE = '__root__'

export class ClaudeAdapter {
  private turns: Turn[] = []
  // toolCallId → the Turn that contains the tool call + its position
  private toolIndex = new Map<string, { turn: Turn; partIndex: number }>()
  // toolCallId of an Agent (subagent) tool_use → top-level Turn that owns it
  private subagentOwners = new Map<string, Turn>()
  private snapshot?: SessionSnapshot
  // Client-chosen ids to use for matching user-input echoes, so optimistic
  // turns the client already rendered get upserted instead of duplicated. A
  // FIFO (not a single slot) because a streaming session can have several
  // queued user messages in flight at once; each echo consumes its match.
  private pendingUserEchoes: { id: string; text: string }[] = []

  // --- live streaming previews (only when includePartialMessages is on) ------
  // One accumulator PER message id (`msg_...`) so concurrent streams — parallel
  // subagents, or a root message and a subagent's — never bleed into each other.
  // Each holds the cumulative text of every open content block, keyed by index.
  private previewBuffers = new Map<
    string,
    { parentToolUseId: string | null; blocks: Map<number, PreviewBlock> }
  >()
  // Which message id is currently streaming on each lane (root / per-subagent).
  // Block deltas carry only `index`, no message id, so this routes them to the
  // right buffer. Set on message_start, cleared on message_stop / finalize.
  private currentMsgByLane = new Map<string, string>()

  /**
   * Tell the adapter that a user input with this text has already been
   * emitted optimistically by the client under `id`. The next time the SDK
   * echoes a matching plain user message, the adapter will emit it with
   * `id` instead of the SDK's own uuid.
   */
  expectUserEcho(id: string, text: string) {
    this.pendingUserEchoes.push({ id, text: text.trim() })
    // Bound the queue so a stream of non-matching sends can't grow it forever.
    if (this.pendingUserEchoes.length > 32) this.pendingUserEchoes.shift()
  }

  ingest(raw: unknown): AdapterEmit[] {
    const msg = raw as SdkMessage
    const events: AdapterEmit[] = []

    // --- stream_event → live preview (never persisted) --------------------
    if (msg.type === 'stream_event') {
      return this.ingestStreamEvent(msg)
    }

    // --- system/init → SessionSnapshot ------------------------------------
    if (msg.type === 'system' && msg.subtype === 'init') {
      this.snapshot = {
        sessionId: msg.session_id ?? '',
        model: msg.model,
        cwd: msg.cwd,
        permissionMode: msg.permissionMode,
        tools: msg.tools ?? [],
        mcpServers: msg.mcp_servers ?? [],
        plugins: msg.plugins ?? [],
        skills: msg.skills ?? [],
        slashCommands: msg.slash_commands ?? [],
        agents: msg.agents ?? [],
        updatedAt: new Date().toISOString()
      }
      events.push({ kind: 'snapshot', snapshot: this.snapshot })
      return events
    }

    // --- task_* → SubagentRecord mutations --------------------------------
    if (msg.type === 'system' && msg.subtype === 'task_started') {
      return this.onTaskStarted(msg)
    }
    if (msg.type === 'system' && msg.subtype === 'task_progress') {
      return this.onTaskProgress(msg)
    }
    if (msg.type === 'system' && msg.subtype === 'task_notification') {
      return this.onTaskNotification(msg)
    }

    // --- other system subtypes → SystemNotice -----------------------------
    if (msg.type === 'system') {
      const notice = this.buildSystemNotice(msg)
      if (notice) events.push({ kind: 'notice', notice })
      return events
    }

    if (msg.type === 'rate_limit_event') {
      events.push({
        kind: 'notice',
        notice: {
          id: noticeId('rate-limit'),
          kind: 'rate-limit',
          at: new Date().toISOString(),
          info: msg.rate_limit_info
        }
      })
      return events
    }

    // --- assistant / user → Turn (+ tool-result merges) -------------------
    if (msg.type === 'assistant' || msg.type === 'user') {
      return this.ingestConversationMessage(msg)
    }

    // --- result -----------------------------------------------------------
    if (msg.type === 'result') {
      // The turn is fully done; any live preview buffers left open are stale
      // (each assistant message deletes its own on finalize — this is belt).
      this.previewBuffers.clear()
      this.currentMsgByLane.clear()
      const subtype = (msg.subtype ?? 'success') as ResultSummary['subtype']
      events.push({
        kind: 'result',
        result: {
          subtype,
          cost: msg.total_cost_usd,
          turns: msg.num_turns,
          durationMs: msg.duration_ms
        }
      })
      return events
    }

    // tool_progress, tool_use_summary, auth_status, prompt_suggestion —
    // dropped for display-only mode.
    return events
  }

  // -----------------------------------------------------------------------
  // Live streaming previews (stream_event → StreamPreview)
  // -----------------------------------------------------------------------

  private ingestStreamEvent(msg: SdkMessage): AdapterEmit[] {
    const ev = msg.event
    if (!ev || typeof ev.type !== 'string') return []
    const parent = msg.parent_tool_use_id ?? null
    const lane = parent ?? ROOT_LANE

    switch (ev.type) {
      case 'message_start': {
        const id = ev.message?.id
        if (!id) return []
        // A fresh message on this lane supersedes any prior unfinished one.
        const stale = this.currentMsgByLane.get(lane)
        if (stale && stale !== id) this.previewBuffers.delete(stale)
        this.previewBuffers.set(id, { parentToolUseId: parent, blocks: new Map() })
        this.currentMsgByLane.set(lane, id)
        return []
      }
      case 'content_block_start': {
        const cbType = ev.content_block?.type
        const kind = cbType === 'thinking' ? 'reasoning' : cbType === 'text' ? 'text' : null
        if (kind === null || typeof ev.index !== 'number') return []
        const buf = this.currentBuffer(lane)
        if (!buf) return []
        const seed = kind === 'reasoning' ? ev.content_block?.thinking : ev.content_block?.text
        buf.blocks.set(ev.index, { index: ev.index, kind, text: seed ?? '' })
        return this.emitPreview(lane)
      }
      case 'content_block_delta': {
        if (typeof ev.index !== 'number') return []
        const d = ev.delta
        let add: string | null = null
        let kind: 'text' | 'reasoning' = 'text'
        if (d?.type === 'text_delta' && typeof d.text === 'string') {
          add = d.text
          kind = 'text'
        } else if (d?.type === 'thinking_delta' && typeof d.thinking === 'string') {
          add = d.thinking
          kind = 'reasoning'
        }
        // signature_delta / input_json_delta / unknown carry no visible text.
        if (add === null) return []
        const buf = this.currentBuffer(lane)
        if (!buf) return []
        const existing = buf.blocks.get(ev.index)
        if (existing) existing.text += add
        else buf.blocks.set(ev.index, { index: ev.index, kind, text: add })
        return this.emitPreview(lane)
      }
      case 'message_stop': {
        const id = this.currentMsgByLane.get(lane)
        if (id) this.previewBuffers.delete(id)
        this.currentMsgByLane.delete(lane)
        return []
      }
      // content_block_stop, message_delta, ping — no visible text change.
      default:
        return []
    }
  }

  private currentBuffer(lane: string) {
    const id = this.currentMsgByLane.get(lane)
    return id ? this.previewBuffers.get(id) : undefined
  }

  private emitPreview(lane: string): AdapterEmit[] {
    const id = this.currentMsgByLane.get(lane)
    if (!id) return []
    const buf = this.previewBuffers.get(id)
    if (!buf) return []
    const blocks = [...buf.blocks.values()].sort((a, b) => a.index - b.index).map(b => ({ ...b }))
    return [
      { kind: 'preview', preview: { messageId: id, parentToolUseId: buf.parentToolUseId, blocks } }
    ]
  }

  // Returns the current snapshot + turns + notices + result as events — used
  // when a new client connects and needs to rebuild the view from scratch.
  hello(): StreamEvent[] {
    const out: StreamEvent[] = []
    if (this.snapshot) out.push({ kind: 'snapshot', snapshot: this.snapshot })
    for (const t of this.turns) out.push({ kind: 'turn', turn: t })
    return out
  }

  // -----------------------------------------------------------------------
  // Conversation messages (assistant/user)
  // -----------------------------------------------------------------------

  private ingestConversationMessage(msg: SdkMessage): StreamEvent[] {
    const events: StreamEvent[] = []

    // This message is now authoritative for its id — drop its live preview
    // buffer so no trailing stream_event can re-emit stale text. The client
    // clears the on-screen preview keyed by the same id when the turn lands.
    if (msg.type === 'assistant' && msg.message?.id) {
      const id = msg.message.id
      this.previewBuffers.delete(id)
      for (const [lane, mid] of this.currentMsgByLane) {
        if (mid === id) this.currentMsgByLane.delete(lane)
      }
    }

    const blocks = contentAsArray(msg.message?.content)
    if (blocks.length === 0) return events

    // Step 1: split the blocks. tool_result blocks merge into existing calls
    // rather than producing a new turn.
    const toolReturns: { toolCallId: string; output: string; isError: boolean }[] = []
    const turnBlocks: ContentBlock[] = []
    for (const b of blocks) {
      if (b.type === 'tool_result' && b.tool_use_id) {
        toolReturns.push({
          toolCallId: b.tool_use_id,
          output: blockOutputText(b),
          isError: !!b.is_error
        })
      } else {
        turnBlocks.push(b)
      }
    }

    // Apply tool returns. Tracks which owner Turns changed so we can re-emit.
    const affected = new Set<Turn>()
    for (const tr of toolReturns) {
      const owner = this.applyToolReturn(tr.toolCallId, tr.output, tr.isError)
      if (owner) affected.add(owner)
    }

    // Step 2: build a Turn from the remaining blocks (text / thinking /
    // tool_use / files). If nothing's left, we only have tool returns.
    const turn = this.buildTurn(msg, turnBlocks)

    const parentId = msg.parent_tool_use_id ?? undefined

    if (turn) {
      if (parentId && this.subagentOwners.has(parentId)) {
        // Nested turn inside a subagent transcript
        const owner = this.subagentOwners.get(parentId)!
        const sub = findSubagentCall(owner, parentId)?.subagent
        if (sub) {
          sub.transcript.push(turn)
          this.registerToolCalls(turn)
          affected.add(owner)
        }
      } else {
        // Top-level turn
        this.registerToolCalls(turn)
        this.turns.push(turn)
        affected.add(turn)
      }
    }

    for (const t of affected) events.push({ kind: 'turn', turn: t })
    return events
  }

  private buildTurn(msg: SdkMessage, blocks: ContentBlock[]): Turn | undefined {
    const parts: Part[] = []
    let firstText = ''

    for (const b of blocks) {
      switch (b.type) {
        case 'text':
          if (b.text) {
            let text = b.text
            if (msg.type === 'user' && !msg.isSynthetic) {
              // Non-image attachments reach the agent as a temp-path note
              // appended to the user's text (see lib/attachment-note.ts). The
              // SDK persists that appended text, so fold the note back into
              // file chips here — a reloaded bubble matches the live one
              // instead of leaking temp paths into it.
              const split = splitAttachmentNote(text)
              text = split.text
              for (const f of split.files) {
                parts.push({
                  type: 'file',
                  mediaType: 'application/octet-stream',
                  url: f.path,
                  filename: f.filename
                })
              }
              // An attachment-only message carries a synthesized placeholder
              // prompt; the bubble should show just the attachments.
              if (text === ATTACHMENT_ONLY_PLACEHOLDER && parts.some(p => p.type === 'file')) {
                text = ''
              }
            }
            if (text) {
              parts.push({ type: 'text', text })
              if (!firstText) firstText = text
            }
          }
          break
        case 'thinking':
          if (b.thinking)
            parts.push({ type: 'reasoning', text: b.thinking, signature: b.signature })
          break
        case 'redacted_thinking':
          parts.push({ type: 'reasoning', text: '', redacted: true, signature: b.signature })
          break
        case 'tool_use':
        case 'server_tool_use':
        case 'mcp_tool_use': {
          if (!b.id || !b.name) break
          const call: ToolCall = {
            toolCallId: b.id,
            name: b.name,
            caller: callerFromBlockType(b.type, b.name),
            provider: 'claude-code',
            mcpServer: b.type === 'mcp_tool_use' ? b.server_name : undefined,
            state: 'running',
            input: b.input ?? {}
          }
          if (b.name === 'Skill') {
            const input = (b.input ?? {}) as { skill?: string }
            call.skill = { skillName: input.skill ?? '' }
          }
          parts.push({ type: 'tool-call', call })
          break
        }
        case 'file':
        case 'image':
        case 'document': {
          // A bare `url` (legacy) or an Anthropic source block: base64 → data
          // URL so the persisted attachment re-renders on cold load, or a
          // source `url` passed through as-is.
          const src = b.source
          let url = b.url
          let mediaType = b.media_type ?? src?.media_type ?? b.type
          if (!url && src) {
            if (src.type === 'base64' && src.data && src.media_type) {
              url = `data:${src.media_type};base64,${src.data}`
              mediaType = src.media_type
            } else if (src.url) {
              url = src.url
            }
          }
          if (url) {
            parts.push({ type: 'file', mediaType, url, filename: b.filename })
          }
          break
        }
      }
    }

    if (parts.length === 0) return undefined

    const role: 'user' | 'assistant' = msg.type === 'user' ? 'user' : 'assistant'
    let origin: TurnOrigin
    if (role === 'assistant') {
      origin = { kind: 'user-input' }
    } else if (msg.isReplay) {
      origin = { kind: 'replay' }
    } else if (msg.isSynthetic) {
      origin = { kind: 'synthetic', reason: classifySyntheticReason(firstText) }
    } else if (msg.parent_tool_use_id) {
      origin = { kind: 'subagent-prompt', parentToolCallId: msg.parent_tool_use_id }
    } else {
      origin = { kind: 'user-input' }
    }

    // If a skill-invoking tool call and this is the synthetic SKILL.md body
    // that followed, stash it on the owning Skill tool call rather than
    // surfacing a separate synthetic turn in the scroll.
    if (role === 'user' && msg.isSynthetic && firstText) {
      const skillOwner = this.findRecentSkillCall()
      if (skillOwner && !skillOwner.skill?.body) {
        skillOwner.skill = { ...(skillOwner.skill ?? { skillName: '' }), body: firstText }
        // Don't emit a standalone turn — return undefined so the caller
        // simply re-emits the owning turn.
        return undefined
      }
    }

    // If this is the user echo of an optimistic send, reuse the client-chosen
    // id so the optimistic bubble upserts in place.
    let id = turnId(msg)
    if (role === 'user' && origin.kind === 'user-input') {
      const text = firstText.trim()
      const idx = this.pendingUserEchoes.findIndex(e => e.text === text)
      if (idx >= 0) {
        id = this.pendingUserEchoes[idx].id
        this.pendingUserEchoes.splice(idx, 1)
      }
    }

    // The model that actually produced this turn (BetaMessage.model). Present
    // on assistant messages; the most recent one is "the latest model used".
    // `apiMessageId` lets the client reconcile a live preview against this turn.
    const meta: TurnMeta = {}
    if (msg.message?.model) meta.model = msg.message.model
    if (msg.message?.id) meta.apiMessageId = msg.message.id

    return {
      id,
      role,
      origin,
      parentTaskId: msg.parent_tool_use_id ?? undefined,
      parts,
      timestamp: msg.timestamp,
      meta: Object.keys(meta).length > 0 ? meta : undefined
    }
  }

  private findRecentSkillCall(): ToolCall | undefined {
    for (let i = this.turns.length - 1; i >= 0; i--) {
      const t = this.turns[i]
      for (let j = t.parts.length - 1; j >= 0; j--) {
        const p = t.parts[j]
        if (p.type === 'tool-call' && p.call.name === 'Skill' && p.call.skill) return p.call
      }
    }
    return undefined
  }

  private applyToolReturn(toolCallId: string, output: string, isError: boolean): Turn | undefined {
    const loc = this.toolIndex.get(toolCallId)
    if (!loc) return undefined
    const part = loc.turn.parts[loc.partIndex]
    if (part.type !== 'tool-call') return undefined
    part.call.state = isError ? 'error' : 'success'
    if (isError) part.call.errorText = output
    else part.call.output = output
    // Walk up from nested transcripts to the top-level owning turn.
    return this.topLevelOwnerOf(loc.turn)
  }

  private topLevelOwnerOf(turn: Turn): Turn {
    if (this.turns.includes(turn)) return turn
    for (const [, owner] of this.subagentOwners) {
      for (const p of owner.parts) {
        if (
          p.type === 'tool-call' &&
          p.call.subagent?.transcript.some(t => deepContains(t, turn))
        ) {
          return owner
        }
      }
    }
    return turn
  }

  private registerToolCalls(turn: Turn) {
    for (let i = 0; i < turn.parts.length; i++) {
      const p = turn.parts[i]
      if (p.type !== 'tool-call') continue
      this.toolIndex.set(p.call.toolCallId, { turn, partIndex: i })
      if (p.call.caller === 'subagent') this.subagentOwners.set(p.call.toolCallId, turn)
    }
  }

  // -----------------------------------------------------------------------
  // Task (subagent) events
  // -----------------------------------------------------------------------

  private onTaskStarted(msg: SdkMessage): StreamEvent[] {
    const toolCallId = msg.tool_use_id
    if (!toolCallId) return []
    const owner = this.subagentOwners.get(toolCallId)
    if (!owner) return []
    const call = findToolCall(owner, toolCallId)
    if (!call) return []
    call.subagent = {
      taskId: msg.task_id ?? '',
      description: msg.description ?? '',
      progress: [],
      status: 'running',
      transcript: []
    }
    call.state = 'running'
    return [{ kind: 'turn', turn: owner }]
  }

  private onTaskProgress(msg: SdkMessage): StreamEvent[] {
    const toolCallId = msg.tool_use_id
    if (!toolCallId) return []
    const owner = this.subagentOwners.get(toolCallId)
    if (!owner) return []
    const call = findToolCall(owner, toolCallId)
    if (!call?.subagent) return []
    if (msg.description) call.subagent.progress.push(msg.description)
    if (msg.usage) {
      call.subagent.usage = {
        totalTokens: msg.usage.total_tokens,
        toolUses: msg.usage.tool_uses,
        durationMs: msg.usage.duration_ms
      }
    }
    return [{ kind: 'turn', turn: owner }]
  }

  private onTaskNotification(msg: SdkMessage): StreamEvent[] {
    const toolCallId = msg.tool_use_id
    if (!toolCallId) return []
    const owner = this.subagentOwners.get(toolCallId)
    if (!owner) return []
    const call = findToolCall(owner, toolCallId)
    if (!call?.subagent) return []
    const status = msg.status as SubagentRecord['status']
    if (status) call.subagent.status = status
    return [{ kind: 'turn', turn: owner }]
  }

  // -----------------------------------------------------------------------
  // Notices
  // -----------------------------------------------------------------------

  private buildSystemNotice(msg: SdkMessage): SystemNotice | undefined {
    const at = new Date().toISOString()
    switch (msg.subtype) {
      case 'session_state_changed':
        return {
          id: noticeId('session-state'),
          kind: 'session-state',
          at,
          state: (msg.state as 'idle' | 'running' | 'requires-action') ?? 'idle'
        }
      case 'compact_boundary':
        return { id: noticeId('compact'), kind: 'compact', at, metadata: msg.compact_metadata }
      case 'api_retry':
        return {
          id: noticeId('api-retry'),
          kind: 'api-retry',
          at,
          attempt: msg.attempt ?? 0,
          maxRetries: msg.max_retries ?? 0,
          delayMs: msg.retry_delay_ms ?? 0,
          error: typeof msg.error === 'string' ? msg.error : undefined
        }
      case 'hook_started':
      case 'hook_progress':
      case 'hook_response':
        return {
          id: noticeId('hook'),
          kind: 'hook',
          at,
          hookId: msg.hook_id ?? '',
          hookName: msg.hook_name ?? '',
          event: msg.hook_event ?? '',
          status:
            msg.subtype === 'hook_started'
              ? 'started'
              : msg.subtype === 'hook_progress'
                ? 'progress'
                : 'response',
          output: msg.output ?? msg.stdout,
          exitCode: msg.exit_code,
          outcome: msg.outcome as 'success' | 'error' | 'cancelled' | undefined
        }
      case 'files_persisted':
        return {
          id: noticeId('files-persisted'),
          kind: 'files-persisted',
          at,
          files: (msg.files ?? []).map(f => f.filename),
          failed: msg.failed ?? []
        }
      case 'elicitation_complete':
        return {
          id: noticeId('elicitation'),
          kind: 'elicitation',
          at,
          server: msg.mcp_server_name ?? '',
          elicitationId: msg.elicitation_id ?? ''
        }
      default:
        return undefined
    }
  }
}

function findToolCall(turn: Turn, toolCallId: string): ToolCall | undefined {
  for (const p of turn.parts) {
    if (p.type !== 'tool-call') continue
    if (p.call.toolCallId === toolCallId) return p.call
    if (p.call.subagent) {
      for (const t of p.call.subagent.transcript) {
        const nested = findToolCall(t, toolCallId)
        if (nested) return nested
      }
    }
  }
  return undefined
}

function findSubagentCall(owner: Turn, toolCallId: string): ToolCall | undefined {
  for (const p of owner.parts) {
    if (p.type === 'tool-call' && p.call.toolCallId === toolCallId) return p.call
  }
  return undefined
}

function deepContains(haystack: Turn, needle: Turn): boolean {
  if (haystack === needle) return true
  for (const p of haystack.parts) {
    if (p.type === 'tool-call' && p.call.subagent) {
      for (const t of p.call.subagent.transcript) {
        if (deepContains(t, needle)) return true
      }
    }
  }
  return false
}
