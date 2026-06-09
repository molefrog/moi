import type {
  Part,
  ResultSummary,
  SessionSnapshot,
  StreamEvent,
  SubagentRecord,
  SystemNotice,
  ToolCall,
  ToolCaller,
  Turn,
  TurnOrigin
} from './format'

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
}

type SdkMessage = {
  type: string
  subtype?: string
  message?: { role?: string; content?: unknown; model?: string }
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

export class ClaudeAdapter {
  private turns: Turn[] = []
  // toolCallId → the Turn that contains the tool call + its position
  private toolIndex = new Map<string, { turn: Turn; partIndex: number }>()
  // toolCallId of an Agent (subagent) tool_use → top-level Turn that owns it
  private subagentOwners = new Map<string, Turn>()
  private snapshot?: SessionSnapshot
  // Client-chosen id to use for the next matching user-input echo, so the
  // optimistic turn the client already rendered gets upserted instead of
  // duplicated. Cleared once consumed.
  private pendingUserEcho: { id: string; text: string } | null = null

  /**
   * Tell the adapter that a user input with this text has already been
   * emitted optimistically by the client under `id`. The next time the SDK
   * echoes a matching plain user message, the adapter will emit it with
   * `id` instead of the SDK's own uuid.
   */
  expectUserEcho(id: string, text: string) {
    this.pendingUserEcho = { id, text: text.trim() }
  }

  ingest(raw: unknown): StreamEvent[] {
    const msg = raw as SdkMessage
    const events: StreamEvent[] = []

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

    // stream_event, tool_progress, tool_use_summary, auth_status,
    // prompt_suggestion — dropped for display-only mode.
    return events
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
            parts.push({ type: 'text', text: b.text })
            if (!firstText) firstText = b.text
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
        case 'document':
          if (b.url) {
            parts.push({
              type: 'file',
              mediaType: b.media_type ?? b.type,
              url: b.url,
              filename: b.filename
            })
          }
          break
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
    if (
      role === 'user' &&
      origin.kind === 'user-input' &&
      this.pendingUserEcho &&
      firstText.trim() === this.pendingUserEcho.text
    ) {
      id = this.pendingUserEcho.id
      this.pendingUserEcho = null
    }

    // The model that actually produced this turn (BetaMessage.model). Present
    // on assistant messages; the most recent one is "the latest model used".
    const model = msg.message?.model

    return {
      id,
      role,
      origin,
      parentTaskId: msg.parent_tool_use_id ?? undefined,
      parts,
      timestamp: msg.timestamp,
      meta: model ? { model } : undefined
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
