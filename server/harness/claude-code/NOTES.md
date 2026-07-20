# Claude Code (Agent SDK) — message spec & UI-abstraction notes

The wire format the Claude Code harness emits and how it maps onto our
display abstraction (`lib/format.ts`, implemented by `adapter.ts` here).
Originally research for the message-display abstraction; kept as the reference
spec for the CC adapter.

> **Status note.** The SDK wire-format sections (message kinds, content
> blocks, subagent/skill mechanics) remain the reference. But the "current
> implementation" critiques and §14's migration plan describe the
> **pre-refactor** code and have since shipped: chat moved from
> `models.ts` to `session.ts` (both in this folder), `state.ts`'s
> `transformMessage` and the 7-variant `Message` union were replaced by
> `StreamEvent`/`Turn`/`Part` in `lib/format.ts` (built by
> `adapter.ts`), and `MessageBlock.tsx` was replaced by
> `client/components/TurnView.tsx`. Read those sections as historical
> context, not as descriptions of today's code.

Evidence drawn from:

- Upstream types: `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts`
- Upstream nested content types: `node_modules/@anthropic-ai/sdk/resources/beta/messages/messages.d.ts`
- SDK bundled source: `sdk.mjs` (for undocumented behavior around `isSynthetic` / `isReplay`)
- Official docs: <https://code.claude.com/docs/en/agent-sdk/typescript>
- Repo code: `server/agent.ts`, `server/state.ts`, `lib/types.ts`, `client/components/MessageBlock.tsx`
- Captured live: `workspace/raw-sdk-messages.jsonl` (skill load + sub-agent run)

---

## Runtime executable

The Agent SDK remains the transport layer, but every `query()` explicitly uses
the `claude` executable resolved from the moi server's PATH through
`pathToClaudeCodeExecutable`. There is no bundled-executable fallback. If the
command is missing, setup and existing workspaces report:
`Run curl -fsSL https://claude.ai/install.sh | sh in your terminal to install Claude`.

---

## 1. Three layers

```
Layer 1 — SDK wire  ──►  Layer 2 — Repo `Message` (lib/types.ts)  ──►  Layer 3 — UI render
  (21 message kinds                (7 flattened variants                (MessageBlock switch)
   + 15 content blocks)             stripped of nesting metadata)
```

Two filters between L1 and L2 are responsible for everything the UI currently can't show:

- `server/agent.ts:73-86` — forwards only `assistant | user | result`. Drops every `system/*`, `tool_progress`, `stream_event`, `tool_use_summary`, `auth_status`, `rate_limit_event`, `prompt_suggestion`.
- `server/state.ts:93-132` `transformMessage` — inside an assistant/user message, keeps only `text | tool_use | tool_result` content blocks and strips `parent_tool_use_id`, `isSynthetic`, `tool_use_result`, etc.

---

## 2. Layer 1 — Full `SDKMessage` union (21 variants)

Discriminated primarily by `type`, then `subtype` for `'system'` and `'result'`.

```
SDKMessage
├── type:'assistant'               → SDKAssistantMessage           { message:BetaMessage, parent_tool_use_id, uuid, session_id, error? }
├── type:'user'                    → SDKUserMessage                { message:MessageParam, parent_tool_use_id, isSynthetic?, tool_use_result?, priority?, timestamp?, shouldQuery? }
├── type:'user' + isReplay:true    → SDKUserMessageReplay          (resume-replay variant; also file_attachments?)
├── type:'stream_event'            → SDKPartialAssistantMessage    { event:BetaRawMessageStreamEvent }   ← raw token deltas
│
├── type:'result'
│    ├── subtype:'success'                                           SDKResultSuccess { duration_ms, num_turns, result, stop_reason, total_cost_usd, usage, modelUsage, permission_denials, fast_mode_state }
│    └── subtype:'error_during_execution' | 'error_max_turns'
│              | 'error_max_budget_usd' | 'error_max_structured_output_retries'
│
├── type:'system'
│    ├── subtype:'init'                 tools[], mcp_servers[], model, permissionMode, cwd, plugins[], skills[], slash_commands[], agents[], fast_mode_state, claude_code_version, output_style, apiKeySource
│    ├── subtype:'status'               { status:SDKStatus, permissionMode? }
│    ├── subtype:'session_state_changed'{ state:'idle'|'running'|'requires_action' }
│    ├── subtype:'compact_boundary'     { compact_metadata }
│    ├── subtype:'api_retry'            { attempt, max_retries, retry_delay_ms, error_status, error }
│    ├── subtype:'hook_started'         { hook_id, hook_name, hook_event }
│    ├── subtype:'hook_progress'        { …, stdout, stderr, output }
│    ├── subtype:'hook_response'        { …, exit_code?, outcome:'success'|'error'|'cancelled' }
│    ├── subtype:'local_command_output' { content }
│    ├── subtype:'task_started'         { task_id, tool_use_id?, description, task_type?, workflow_name?, prompt? }
│    ├── subtype:'task_progress'        { task_id, tool_use_id?, description, usage, last_tool_name?, summary? }
│    ├── subtype:'task_notification'    { task_id, status:'completed'|'failed'|'stopped', output_file, summary }
│    ├── subtype:'files_persisted'      { files[], failed[], processed_at }
│    └── subtype:'elicitation_complete' { mcp_server_name, elicitation_id }
│
├── type:'tool_progress'           → SDKToolProgressMessage        { tool_use_id, tool_name, parent_tool_use_id, elapsed_time_seconds, task_id? }
├── type:'tool_use_summary'        → SDKToolUseSummaryMessage      { summary, preceding_tool_use_ids[] }
├── type:'auth_status'             → SDKAuthStatusMessage          { isAuthenticating, output[], error? }
├── type:'rate_limit_event'        → SDKRateLimitEvent             { rate_limit_info }
└── type:'prompt_suggestion'       → SDKPromptSuggestionMessage    { suggestion }
```

---

## 3. Layer 1 — Content blocks (inside `SDKAssistantMessage.message.content` and `SDKUserMessage.message.content`)

Anthropic Messages-API shape; same discriminator pattern (`type`).

### Assistant-side blocks

```
BetaContentBlock
├── 'text'                                    { text, citations }
├── 'thinking'                                { thinking, signature }
├── 'redacted_thinking'                       { data }
├── 'tool_use'                                { id, name, input, caller? }
├── 'server_tool_use'                         { id, name:'web_search'|'web_fetch'|'code_execution'|'bash_code_execution'|'text_editor_code_execution'|'tool_search_tool_regex'|'tool_search_tool_bm25', input, caller? }
├── 'mcp_tool_use'                            { server_name, name, input }
├── 'web_search_tool_result'                  results | error
├── 'web_fetch_tool_result'                   content | error
├── 'code_execution_tool_result'              stdout/stderr/return_code | error
├── 'bash_code_execution_tool_result'         stdout/stderr/return_code | error
├── 'text_editor_code_execution_tool_result'  view / create / str_replace results
├── 'tool_search_tool_result'
├── 'mcp_tool_result'
├── 'container_upload'                        { file_id }
└── 'compaction'                              summary of prior turns
```

### User-side blocks (`MessageParam.content`)

```
'text' | 'image' | 'document' | 'tool_result' | 'tool_use' | 'thinking' | 'search_result' | 'container_upload'
```

Of these the repo currently handles only `tool_result`.

---

## 4. Semantic classification of `SDKUserMessage` (the envelope lies)

At the SDK wire level, **every tool result and every harness-injected prompt is a `user` message**, because Anthropic's Messages API has no dedicated role for them. Classify by content and flags, in this priority order:

| #   | Condition                                                      | What it really is                                                                                | UI behavior                                                                                  |
| --- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| 1   | `isReplay: true`                                               | Replay from a resumed session; not new content                                                   | Skip (or render only once from the persisted log)                                            |
| 2   | `content[]` contains a `tool_result` block                     | Tool return back to the model                                                                    | Route into the paired tool-use card; may carry extra metadata in top-level `tool_use_result` |
| 3   | `isSynthetic: true`                                            | Harness-injected context (skill body, slash-command expansion, `<system-reminder>`, hook output) | Transcript-only context; hide by default, expose behind a toggle                             |
| 4   | `parent_tool_use_id !== null` AND first user turn of a subtask | The `Agent` tool's `prompt` argument being replayed as the subtask's opening user turn           | Render as the subtask's prompt inside the nested view, not in the main thread                |
| 5   | none of the above                                              | Actual user input typed into the chat                                                            | Render as the user bubble                                                                    |

### On `isSynthetic` specifically — the docs don't say, the source does

Public docs ([typescript reference](https://code.claude.com/docs/en/agent-sdk/typescript)) list the field in the type but never explain it. Nothing in the CHANGELOG either. The bundled SDK source reveals it's derived:

```js
isSynthetic: K.isMeta || K.isVisibleInTranscriptOnly
if (isSynthetic || q.isReplay) return // early-exit in an internal processing loop
```

So `isSynthetic = true` means: _this user turn was fabricated by the harness and exists only so the model can see it in the transcript; don't treat it as a real utterance._ Practically, it covers skill bodies, slash-command expansions, system reminders, hook outputs, and similar injections.

`isSynthetic` and `parent_tool_use_id` are **orthogonal**. A sub-agent's initial prompt (observed on line 14 of the captured log) has `parent_tool_use_id` set but `isSynthetic` absent — from the subagent's frame, that IS real user input.

---

## 5. Sub-agent invocation — the nesting mechanism

Observed live for an `Agent` tool call (`workspace/raw-sdk-messages.jsonl` lines 10–31). Four distinct mechanisms co-operate.

### Event sequence

```
12  assistant  [tool_use:Agent]                            tool_use_id=toolu_017X…     ← parent thread
13  system/task_started    task_id=a9ef…  tool_use_id=toolu_017X…  description="Check widgets folder contents"
14  user       [text]      parent=toolu_017X…                                          ← subagent's initial prompt
15  rate_limit_event
16  system/task_progress   description="Running ls -la …"
17  assistant  [tool_use:Bash]   parent=toolu_017X…                                    ← inside the subtask
18  user       [tool_result]     parent=toolu_017X…
19  system/task_progress   description="Running find …"
20  assistant  [tool_use:Bash]   parent=toolu_017X…
21  user       [tool_result]     parent=toolu_017X…
22  system/task_progress   description="Reading .widgets/package.json"
23  assistant  [tool_use:Read]   parent=toolu_017X…
24  user       [tool_result]     parent=toolu_017X…
25  system/task_progress   description="Running ls -lh …"
26  assistant  [tool_use:Bash]   parent=toolu_017X…
27  user       [tool_result]     parent=toolu_017X…
28  system/task_notification   status=completed  task_id=a9ef…  tool_use_id=toolu_017X…
29  user       [tool_result]                                                           ← Agent tool's return to parent
30  assistant  [text]                                                                  ← parent thread resumes
31  result/success
```

### Roles of the four mechanisms

| Mechanism                                              | Purpose                                                                           | Use in UI                                                                                                      |
| ------------------------------------------------------ | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `parent_tool_use_id` on nested assistant/user messages | THE discriminator for "this message is inside the subtask, not the main thread"   | Group nested turns into an expandable sub-thread under the Agent tool card                                     |
| `system/task_started`                                  | Harness announces subtask begin (carries `task_id`, `tool_use_id`, `description`) | Initial "starting" label on the Agent card                                                                     |
| `system/task_progress`                                 | Out-of-band status per tool call the subagent makes (e.g. `"Running ls -la …"`)   | Live status line on the collapsed Agent card — avoids rendering the full nested transcript for the common case |
| `system/task_notification`                             | Terminal event, `status: 'completed' \| 'failed' \| 'stopped'`                    | Finalize the Agent card                                                                                        |

### Three identifiers — don't conflate

- `tool_use_id` (`toolu_017X…`) — the assistant's tool-call UUID from the `tool_use` block. Matches the final parent-thread `tool_result` (line 29).
- `task_id` (`a9efdb…`) — harness-generated short hash; present on every `system/task_*` event. Useful when subtasks run in parallel.
- `parent_tool_use_id` — set on messages that _belong to_ a subtask. The one the UI tree should be keyed on.

### Current repo bug

`state.ts`'s `transformMessage` strips `parent_tool_use_id` when converting to the repo's `Message` type, so the nested subagent turns that DO make it through (since their envelope is `assistant`/`user`) render flat in the main transcript, indistinguishable from the parent thread. All four `system/task_*` events are dropped entirely by `agent.ts`, so the progress line and completion status never reach the client.

---

## 6. Skill loading — observed shape

Skills are not a dedicated message type. Captured live (log lines 1–9):

1. `system/init` advertises skills as a string array: `skills: ["widgets", "loop", …]`, plus a generic `Skill` entry in `tools[]` and mirrored `slash_commands[]`.
2. Assistant emits a `thinking` block ("There's a skill available called 'widgets'…").
3. Assistant emits a regular `tool_use` — `{ name: "Skill", input: { skill: "widgets" }, caller: { type: "direct" } }`.
4. Two user messages arrive in sequence:
   - normal `tool_result` ack (`"Launching skill: widgets"`) with extra top-level `tool_use_result: { success: true, commandName: "widgets" }` on the envelope;
   - **synthetic** user message (`isSynthetic: true`) whose content is a single `text` block carrying the full SKILL.md body — this is how the skill's instructions enter the conversation.
5. Assistant resumes with thinking + text; `result/success` terminates.

UI implication: render `tool_use.name === "Skill"` with a special icon/label, consume `tool_use_result.commandName` for success state, and route the synthetic text block into the "injected context" lane (not the user bubble).

---

## 7. Layer 2 — repo's current `Message` union

`lib/types.ts`:

```
Message
├── 'user'         { content: string }                                         ← loses parent_tool_use_id, isSynthetic, timestamp, priority, tool_use_result
├── 'assistant'    { content: string }                                         ← loses parent_tool_use_id, loses all thinking/server-tool blocks
├── 'tool_use'     { id, name, input }                                         ← loses caller, loses parent_tool_use_id context
├── 'tool_result'  { tool_use_id, content, is_error }
├── 'done'         { cost, turns, session_id }                                  ← from result/success only
├── 'error'        { content }                                                   ← from result/error_*
└── 'stopped'     {}
```

---

## 8. Layer 3 — current UI handling

`client/components/MessageBlock.tsx`:

| Repo type     | Rendered as                                                                             | Notes                                                                                                                                                 |
| ------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `user`        | Right-aligned plain text                                                                | No distinction between typed input, tool return, or synthetic content (but tool_result and synthetic never reach here because state.ts rewrites them) |
| `assistant`   | Markdown                                                                                |                                                                                                                                                       |
| `tool_use`    | `<details>` with name + JSON input preview, paired with preceding sibling's tool_result | No special-casing for `Agent`, `Skill`, `Bash`, etc.                                                                                                  |
| `tool_result` | Nothing (consumed by preceding tool_use)                                                |                                                                                                                                                       |
| `done`        | Hidden                                                                                  |                                                                                                                                                       |
| `stopped`     | Hidden                                                                                  |                                                                                                                                                       |
| `error`       | Red box                                                                                 |                                                                                                                                                       |
| anything else | Switch has NO default — renders crash                                                   |                                                                                                                                                       |

---

## 9. What's missing today vs. what the SDK emits

Known blind spots the abstraction should close (historical audit — items marked
CLOSED have since been handled; see adapter.ts / session.ts):

- **Thinking blocks** — SDK emits them; `transformMessage` drops them. Would require a new repo-level block type.
- **Server tool use** (`web_search`, `web_fetch`, `code_execution`, etc.) — completely invisible. An assistant using `WebSearch` currently looks like a silent gap between user turn and final answer.
- **MCP tool calls proper** (`mcp_tool_use` / `mcp_tool_result` blocks) — dropped. Regular `Task`/`Bash` MCP tools happen to survive because they wear the plain `tool_use` shape.
- **Streaming** — CLOSED: `stream_event` drives live token previews (`preview` frames) when the client opts into streaming.
- **Session lifecycle signals** — partially CLOSED: `system/init` feeds the session snapshot; `system/session_state_changed` mirrors into `SessionActivity` (note: current CLIs don't emit it in streaming-input mode — `result` is the everyday turn-over fallback); `requires-action` reaches the wire but has no UI yet. `system/status` (`requesting`/`compacting`) still dropped.
- **Sub-agent nesting** — CLOSED: `task_started`/`task_progress`/`task_notification` build nested subagent records; `task_started`/`task_updated`/`task_notification` also track live background tasks for the idle-eviction keep-alive (session.ts `bgTasks`).
- **Hooks / rate limits / api_retry** — CLOSED: surfaced as notices.
- **MessageBlock switch exhaustiveness** — the UI layer this referred to (`MessageBlock.tsx`) no longer exists; turns render via `TurnView`/`ToolCallGroup`.

---

## 10. Recommended abstraction — three stages

```
Stage 1 — Raw SDK event            (vendor-shaped, lossless)
                │
                ▼  per-agent adapter
Stage 2 — Normalized event         (agent-agnostic, flat, stream-grained)
                │   kinds: user_text, assistant_text_delta, thinking_delta,
                │          tool_started, tool_progress, tool_finished,
                │          subtask_started, subtask_progress, subtask_finished,
                │          session_init, session_status, rate_limit,
                │          result, error, cost_update
                ▼  event fold
Stage 3 — Display item tree        (what the UI lays out)
                   Turn { id, role, parentTaskId, blocks[], children[] }
                   Task { toolUseId, taskId, description, progress[], status }
```

### Rules the abstraction should enforce

- Every SDK message must map to exactly one normalized event (or be explicitly ignored); no silent drops.
- Turns are keyed by `uuid`; nested by `parent_tool_use_id`; the UI descends the tree to render sub-agent transcripts.
- `Task` lives on its own lane keyed by `tool_use_id`; the Agent tool-use card renders description + progress + "show nested transcript" expander that reveals the sub-turn tree.
- Classification of user envelopes: run the 5-priority table from §4 at the adapter boundary; downstream code receives already-classified items.
- `Block` union is exhaustive and the UI switch has a `_: never` default, so adding a new block is a compile error, not a render crash.

### Why three stages, not two

Stage 2 is what lets us support non-Claude agents later. Different SDKs map onto the same normalized event stream with different adapters; Stage 3 doesn't care whose agent produced the events. Stage 1 stays lossless so debugging/replay tooling (and this research) keeps working.

---

## 11. Field reference — undocumented / under-documented items

Worth recording because the official docs list the field but don't describe it:

- `SDKUserMessage.isSynthetic?: boolean` — harness-injected transcript-only content (see §4).
- `SDKUserMessage.tool_use_result?: unknown` — extra envelope-level metadata attached by the harness when a user message carries a `tool_result` block. Example seen: `{ success: true, commandName: "widgets" }` for a skill tool. Not the same as the inner `tool_result` block's `content`.
- `SDKUserMessage.priority?: 'now' | 'next' | 'later'` — queueing hint; no semantics documented.
- `SDKUserMessage.timestamp?: string` — ISO time the message was created on the originating process. Older emitters omit it; consumers should fall back to receive time.
- `SDKUserMessage.shouldQuery?: boolean` — docs list it, don't describe it. Likely controls whether the harness re-queries the model after this message.
- `SDKUserMessageReplay.isReplay: true` + `file_attachments?: unknown[]` — emitted when resuming a session; the SDK short-circuits further processing on these.
- `BetaToolUseBlock.caller?: BetaDirectCaller | BetaServerToolCaller` — observed as `{ type: "direct" }` in captured logs; distinguishes direct model calls from server-tool-chained calls.

---

## 12. Captured-log inventory

Log: `workspace/raw-sdk-messages.jsonl`, produced by `appendRawLog` added in `server/agent.ts`.

Counts from the two runs captured so far (skill-load + sub-agent):

```
  11 assistant
   2 rate_limit_event
   2 result/success
   2 system/init
   1 system/task_notification
   4 system/task_progress
   1 system/task_started
   8 user        (mix of tool_result, text, synthetic)
```

To grow coverage of rarer variants (`hook_*`, `session_state_changed`, `compact_boundary`, `stream_event`, `api_retry`, `auth_status`, `prompt_suggestion`, `tool_use_summary`, `local_command_output`, `files_persisted`, `elicitation_complete`), drive runs that exercise hooks, long sessions that trigger compaction, streaming mode, and MCP-authenticated tools.

## 13. Vercel AI SDK `UIMessage` — reference and gap analysis

Canonical AI SDK `UIMessage` shape ([ui-messages.ts](https://github.com/vercel/ai/blob/main/packages/ai/src/ui/ui-messages.ts)):

```ts
interface UIMessage<METADATA, DATA_PARTS, TOOLS> {
  id: string
  role: 'system' | 'user' | 'assistant'
  metadata?: METADATA
  parts: UIMessagePart<DATA_PARTS, TOOLS>[]
}

type UIMessagePart =
  | TextUIPart // { type: 'text', text, state?: 'streaming'|'done' }
  | ReasoningUIPart // same shape, type: 'reasoning'
  | ReasoningFileUIPart // non-text reasoning artifacts
  | ToolUIPart<TOOLS> // type: `tool-${name}`, one part whose state evolves
  | DynamicToolUIPart // type: 'dynamic-tool' — schema-less (MCP lands here)
  | SourceUrlUIPart // citations (web)
  | SourceDocumentUIPart // citations (documents)
  | FileUIPart // attached file, data:/remote URL
  | DataUIPart<DATA_PARTS> // user-typed custom parts: `data-${NAME}`
  | CustomContentUIPart // provider-specific escape hatch
  | StepStartUIPart // marker-only, delimits multi-step
```

Tool lifecycle collapses `tool_use` + `tool_result` into one evolving part:

```
input-streaming → input-available →
  [ approval-requested → approval-responded ] →
    output-available | output-error | output-denied
```

`input`, `output`, `errorText`, and three separate metadata slots (`providerMetadata`, `callProviderMetadata`, `resultProviderMetadata`) all sit on the same part. `preliminary: true` on `output-available` is how sub-agents stream progress — same part, updated output, then a final non-preliminary output.

### Feature gap vs. Claude Agent SDK

Comparing AI SDK's `UIMessage` against the Claude features catalogued in §2–§6 of this doc:

| Claude feature                                                                                               | AI SDK              | Notes                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------ | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Synthetic user messages (`isSynthetic`)                                                                      | **Nothing**         | Skill bodies, system reminders, hook output — no place to put them. `role` is only `user/assistant/system`.                                                |
| Session init (tools, mcp_servers, model, permissionMode, cwd, plugins, skills, slash_commands)               | **Nothing**         | `UIMessage` is message-scoped. No inventory of what's available.                                                                                           |
| Sub-agent nesting                                                                                            | **Partial**         | Pattern is "tool's `output` is itself a `UIMessage`"; recurse into `output.parts`. No `parent_tool_use_id`, no `task_started/progress/notification`.       |
| Skills                                                                                                       | **Partial**         | Skill invocation = generic `tool-*` part. The synthetic SKILL.md follow-up has no home.                                                                    |
| Server tool variants (web_search, code_execution, text_editor, …)                                            | **Partial**         | Collapsed into `providerExecuted: true`. Rich structured outputs (stdout/stderr/return_code, search results) must be reconstructed from `output: unknown`. |
| Reasoning / thinking                                                                                         | **Direct match**    | `reasoning` part + `reasoning-file`; redacted/signed thinking goes in `providerMetadata`.                                                                  |
| MCP                                                                                                          | **Not first-class** | MCP tools are just `dynamic-tool` parts. No `server_name`, no elicitation.                                                                                 |
| Hooks, rate limits, api_retry, compact_boundary, local_command_output, files_persisted, elicitation_complete | **Nothing**         | Opaque `error` chunks only; everything else would be custom `data-*` parts.                                                                                |
| `tool_use_result` envelope sidecar                                                                           | **Partial**         | Fits in `resultProviderMetadata` or message `metadata`, but semantically meant for provider fields.                                                        |
| Caller info (direct vs server_tool vs MCP vs subagent)                                                       | **Partial**         | Only a boolean (`providerExecuted`). Chain origin is lost.                                                                                                 |

**Short version:** AI SDK cleanly covers "what the model emitted in one response." It has almost no vocabulary for harness/session/subagent lifecycle signals — exactly the layer where Claude is richest.

### Worth stealing from AI SDK

1. **`parts: Part[]` discriminated-union** instead of `content: string`.
2. **One tool call = one part whose `state` evolves** — kills the `tool_use` / `tool_result` sibling-pair hack.
3. **Human-in-the-loop as explicit states** (`approval-requested`, `output-denied`) rather than flags.
4. **Three named metadata slots** (part-level, call-level, result-level) avoid collisions.
5. **`preliminary: true` for sub-agent progress** — same part, updated output.
6. **`step-start` as a marker part** — multi-step stays linear in `parts`.
7. **Type-parameterized `DATA_PARTS`** — custom content without forking the core union.
8. **`dynamic-tool` fallback** — graceful degradation when a schema isn't known.

## 14. Proposed intermediate display format

Display-only. No streaming, no tool-arg streaming. MCP, sub-agents, skills first-class. Built once at ingest from the SDK stream and held in memory / persisted as-is.

### Three-track conversation model

Most UIs treat a chat as a flat list of turns. Claude's stream has three distinct concerns that each deserve their own lane:

```ts
type ConversationEvent =
  | Turn // transcript entries (render as bubbles / tool cards)
  | SystemNotice // chrome strip / toast (rate limits, hooks, retries, results)
  | SessionSnapshot // inventory panel (model, tools, MCP status, permission mode)
```

### Turn — one transcript entry

```ts
type Turn = {
  id: string
  role: 'user' | 'assistant'
  origin: TurnOrigin // why this turn exists (replaces AI SDK's flat role)
  parentTaskId?: string // set when turn belongs inside a subtask
  parts: Part[]
  metadata?: Record<string, unknown>
  timestamp?: string
}

type TurnOrigin =
  | { kind: 'user-input' } // typed in the chat box
  | { kind: 'tool-return'; toolCallId: string } // Claude's user envelope wrapping a tool_result
  | {
      kind: 'synthetic'
      reason: // Claude's isSynthetic
        'skill-body' | 'system-reminder' | 'hook-output' | 'slash-command' | 'other'
    }
  | { kind: 'subagent-prompt'; parentToolCallId: string } // the Agent tool's prompt arg
  | { kind: 'replay' } // resumed session playback
```

The `TurnOrigin` tag is what tells the renderer whether to draw a user bubble, route to a tool card, hide behind a "show context" toggle, or skip entirely. This is the missing piece in AI SDK's `UIMessage`.

### Part — the AI SDK shape, widened for Claude

```ts
type Part =
  | { type: 'text'; text: string; citations?: Citation[] }
  | { type: 'reasoning'; text: string; redacted?: boolean; signature?: string }
  | { type: 'tool-call'; call: ToolCall }
  | { type: 'file'; mediaType: string; url: string; filename?: string }
  | { type: 'source-url'; url: string; title?: string; sourceId: string }
  | { type: 'source-document'; mediaType: string; title: string; sourceId: string }
  | { type: 'data'; name: string; data: unknown } // escape hatch

type Citation = { url?: string; title?: string; quote?: string }
```

### ToolCall — one evolving entity (AI SDK's key idea)

No more `tool_use` + `tool_result` sibling-pair hack. One `ToolCall` record owns the entire call:

```ts
type ToolCall = {
  toolCallId: string
  name: string
  caller: 'model' | 'server-tool' | 'mcp' | 'subagent' // widens AI SDK's providerExecuted: boolean
  mcpServer?: string // only when caller === 'mcp'
  state: ToolState
  input: unknown
  output?: unknown
  errorText?: string
  sidecar?: Record<string, unknown> // Claude's tool_use_result envelope
  subagent?: SubagentRecord // only when caller === 'subagent'
  skill?: { skillName: string; body?: string } // only when name === 'Skill'
}

type ToolState =
  | 'pending' // input known, not yet executed (rare for display)
  | 'approval-pending'
  | 'approval-denied'
  | 'running'
  | 'success'
  | 'error'
```

### SubagentRecord — enables the "one-line + modal" UX

```ts
type SubagentRecord = {
  taskId: string // from system/task_started
  description: string // one-line label
  progress: string[] // each task_progress.description
  status: 'running' | 'completed' | 'failed' | 'stopped'
  usage?: { totalTokens: number; toolUses: number; durationMs: number }
  transcript: Turn[] // nested turns (parent_tool_use_id === toolCallId)
}
```

**One-line render** in the main transcript uses `description` + `status` + optionally `progress[-1]`.
**Modal** recursively renders `transcript` with the same `TurnList` component, nested sub-agents included.

### SessionSnapshot — inventory (AI SDK has nothing here)

```ts
type SessionSnapshot = {
  id: string
  sessionId: string
  model: string // e.g. 'claude-sonnet-4-6'
  cwd: string
  permissionMode: string // 'bypassPermissions' | 'default' | ...
  tools: string[]
  mcpServers: { name: string; status: string }[] // status: 'connected'|'needs-auth'|'failed'|'disabled'|'pending'
  plugins: { name: string; path: string }[]
  skills: string[]
  slashCommands: string[]
  agents: string[]
  updatedAt: string
}
```

Drives the chrome: model badge, MCP server status dots, permission mode pill, slash-command picker, skill menu.

### SystemNotice — banners / toasts / chrome transients

```ts
type SystemNotice =
  | { kind: 'rate-limit'; at: string; info: unknown }
  | { kind: 'api-retry'; attempt: number; max: number; delayMs: number; error?: string }
  | { kind: 'compact'; metadata: unknown }
  | {
      kind: 'hook'
      hookName: string
      event: string
      status: 'started' | 'progress' | 'response'
      output?: string
      exitCode?: number
      outcome?: string
    }
  | { kind: 'session-state'; state: 'idle' | 'running' | 'requires-action' }
  | { kind: 'status'; status: string }
  | { kind: 'files-persisted'; files: string[]; failed: { filename: string; error: string }[] }
  | { kind: 'elicitation'; server: string; id: string }
  | {
      kind: 'result'
      subtype:
        | 'success'
        | 'error_during_execution'
        | 'error_max_turns'
        | 'error_max_budget_usd'
        | 'error_max_structured_output_retries'
      cost?: number
      turns?: number
    }
```

None of these belong in the main scroll of turns. They're ephemeral UI: status bars, toasts, footer cost line.

### Ingest pipeline — how to build this from the SDK stream

1. `system/init` → open a `SessionSnapshot`; refresh on every subsequent `init`.
2. `system/task_started` → open a `SubagentRecord` inside the `ToolCall` whose `toolCallId` matches `tool_use_id`; set `description`, `status: 'running'`.
3. `system/task_progress` → push `description` onto the owning `SubagentRecord.progress`; update `usage`.
4. `system/task_notification` → flip `SubagentRecord.status` and freeze.
5. Assistant / user messages with `parent_tool_use_id` set → append to the matching `SubagentRecord.transcript` rather than the main turn list.
6. User messages carrying a `tool_result` block → classify as `TurnOrigin.kind = 'tool-return'`; merge the result into the owning `ToolCall` (flip `state`, set `output` / `errorText`), don't render as a standalone turn.
7. User messages with `isSynthetic: true` → classify as `TurnOrigin.kind = 'synthetic'`, inferring `reason` from context (skill body if it followed a `Skill` tool, system-reminder if it contains a `<system-reminder>` tag, etc.).
8. User messages with `isReplay: true` → classify as `TurnOrigin.kind = 'replay'`.
9. Everything else → `SystemNotice` by subtype, or ignored (`stream_event`, `tool_progress`).

### What this gives us

- **Exhaustive renderer**: `switch (part.type)` with a `_: never` default — future block types fail at compile time, not at runtime.
- **No sibling-lookup hacks**: tool card reads everything from its own `ToolCall`.
- **Sub-agent UX**: one-line label with live progress, click to open modal that recursively renders the nested transcript.
- **Skill handling**: a `Skill` tool-call renders its name with a small icon; the synthetic SKILL.md body lives hidden in `skill.body` (or on a matching synthetic turn) and is never shown in the scroll unless the user expands it.
- **MCP**: tool calls carry `caller: 'mcp'` + `mcpServer`, so the renderer can badge them differently without parsing the tool name.
- **Session chrome**: `SessionSnapshot` drives a sidebar/header, not the scroll.
- **Future agents**: a different agent's adapter emits the same three tracks; the renderer doesn't know which SDK produced the events.

### Repo changes required

- `server/agent.ts:73-86` — stop filtering out `system/*`, `rate_limit_event`, `tool_progress`. Route them to `SessionSnapshot` / `SystemNotice` / owning `SubagentRecord`.
- `server/state.ts:93-132` — rewrite `transformMessage` as a classifier per §4's priority table. Preserve `parent_tool_use_id`, `isSynthetic`, `tool_use_result`.
- `lib/types.ts` — replace the 7-variant flat union with the three-track model above.
- `client/components/MessageBlock.tsx` — `switch (part.type)` with exhaustive `never` default; new `SubagentCard`, `SkillCard`, `ServerToolCard` components.
