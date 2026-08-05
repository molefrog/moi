// Inline fixtures for the /dev/chat-states catalog. Every payload mirrors what
// the live gateways emit (OpenClaw message/toolCall shapes, Claude Code MCP
// naming, subagent task records) so the page stays an honest reference for
// restyling the chat — but all content itself is synthetic. Pure data: the
// page renders these through the REAL chat components with no server calls.
import type { LivePreview } from '@/client/features/chat/chat-store'
import type { Part, SessionInfo, StreamPreview, SystemNotice, ToolCall, Turn } from '@/lib/types'

// Fake workspace identity for context providers and the live activity store.
export const DEV_WORKSPACE_ID = 'dev-chat-states'
export const DEV_SESSION_ID = 'agent:main'
export const DEV_CWD = '/Users/mole/.openclaw/workspace'

// Fixed timeline base so timestamps (which drive turn merge order and notice
// interleaving) are deterministic.
const T0 = Date.UTC(2026, 7, 4, 9, 30, 0)
function at(offsetMin: number): string {
  return new Date(T0 + offsetMin * 60_000).toISOString()
}

function userTurn(id: string, seq: number, text: string, offsetMin: number): Turn {
  return {
    id: `openclaw:${DEV_SESSION_ID}:${id}`,
    role: 'user',
    origin: { kind: 'user-input' },
    parts: [{ type: 'text', text }],
    timestamp: at(offsetMin),
    seq
  }
}

function assistantTurn(id: string, seq: number, parts: Part[], offsetMin: number): Turn {
  return {
    id: `openclaw:${DEV_SESSION_ID}:${id}`,
    role: 'assistant',
    origin: { kind: 'user-input' },
    parts,
    timestamp: at(offsetMin),
    seq
  }
}

function toolPart(call: ToolCall): Part {
  return { type: 'tool-call', call }
}

// ---- Turns ------------------------------------------------------------------

// 1. Short user message.
export const userShort = userTurn('201', 201, 'hey! is the gateway still running?', 0)

// 2. Long user message with markdown — user bubbles render text verbatim
// (whitespace preserved), so the fences show as typed.
export const userLongMarkdown = userTurn(
  '204',
  204,
  [
    'I keep hitting a race when two tabs save the layout at the same time — the second PUT reverts the first tab’s widget positions.',
    '',
    'I already tried throttling the save, disabling optimistic updates, and forcing a refetch after every save. Nothing helped. The debounced writer looks like this:',
    '',
    '```ts',
    'const save = useDebouncedCallback((layout: WorkspaceLayout) => {',
    '  qc.setQueryData(workspaceKeys.layout(id), layout)',
    '  mutate(layout)',
    '}, 600)',
    '```',
    '',
    'Can you figure out where the revert actually comes from?'
  ].join('\n'),
  2
)

// 3. Channel-routed user message. On the wire this arrived over IRC — the
// session carries origin { provider: 'irc', label: 'mole!mole@127.0.0.1' } and
// the gateway prepends a metadata envelope ("[Mon 2026-08-04 11:34 GMT+2]",
// "Sender (untrusted metadata): …") that the adapter strips before display, so
// the turn itself reads as plain user input.
export const userChannelRouted = userTurn(
  '87',
  87,
  'morning moi — heading out around six, remind me to push the release notes before that?',
  4
)

// 4. Assistant reply with rich markdown.
export const assistantRichMarkdown = assistantTurn(
  '210',
  210,
  [
    {
      type: 'text',
      text: [
        '## Workspace audit',
        '',
        'Here is what I found after walking the tree:',
        '',
        '- `widgets/` has **3 bundles** still targeting the old RPC base',
        '- `views/dashboard.tsx` imports `react-dom` directly, which breaks the shared vendor contract',
        '- `.moi/.workspace.json` references a widget that no longer exists',
        '',
        '| File | Issue | Fix |',
        '| --- | --- | --- |',
        '| `widgets/uptime/index.tsx` | stale RPC base | rebundle |',
        '| `views/dashboard.tsx` | direct `react-dom` import | use the importmap |',
        '| `.moi/.workspace.json` | orphaned widget id | prune the entry |',
        '',
        'The vendor contract is documented in [client/AGENTS.md](https://github.com/molefrog/moi). Quick check you can run yourself:',
        '',
        '```ts',
        "import { readdirSync } from 'node:fs'",
        '',
        "const bundles = readdirSync('.moi/widgets')",
        'console.log(bundles.filter(b => !manifest.has(b)))',
        '```',
        '',
        'Want me to apply all three fixes?'
      ].join('\n')
    }
  ],
  6
)

// 5. Assistant turn carrying the full meta block a gateway reports (model,
// provider, stop reason, usage). Nothing in the transcript renders it today —
// it rides on the turn for future treatments.
export const assistantWithMeta: Turn = {
  ...assistantTurn(
    '213',
    213,
    [
      {
        type: 'text',
        text: 'The moon is Earth’s only natural satellite. It orbits at an average distance of 384,400 km, is tidally locked (we always see the same face), and its gravity drives the ocean tides. It formed about 4.5 billion years ago, most likely from debris after a Mars-sized body struck the early Earth.'
      }
    ],
    8
  ),
  meta: {
    model: 'claude-sonnet-5',
    provider: 'anthropic',
    stopReason: 'stop',
    usage: { inputTokens: 4, outputTokens: 151, totalTokens: 41811, costUsd: 0.1129 }
  }
}

// 6. Reasoning part first, then text — the collapsed "Thought" row above prose.
export const assistantReasoningFirst = assistantTurn(
  '216',
  216,
  [
    {
      type: 'reasoning',
      text: 'The user wants a short factual answer. I should keep it to one sentence and skip the tangent about tidal locking.'
    },
    {
      type: 'text',
      text: 'On average the moon is 384,400 km away — light covers that distance in about 1.3 seconds.'
    }
  ],
  10
)

// 7. Codex-style serialization: one assistant message per agent step. The two
// tool-only turns merge into the first assistant turn (group-turns), so the
// rail reads as one run; the closing turn has text and stays separate.
export const toolMergeTurns: Turn[] = [
  userTurn('301', 301, 'how many skills are installed in this workspace?', 12),
  assistantTurn(
    '302',
    302,
    [
      {
        type: 'reasoning',
        text: 'Skills live under the workspace skills directory — count the entries.'
      },
      toolPart({
        toolCallId: 'toolu_01Kq3VbTfXjRmA2c',
        name: 'exec',
        caller: 'model',
        provider: 'openclaw',
        state: 'success',
        input: { command: 'ls ~/.openclaw/workspace/skills | wc -l' },
        output: '4'
      })
    ],
    13
  ),
  assistantTurn(
    '303',
    303,
    [
      toolPart({
        toolCallId: 'toolu_01N8dWcYhLpQx7Ke',
        name: 'exec',
        caller: 'model',
        provider: 'openclaw',
        state: 'success',
        input: { command: 'ls ~/.openclaw/workspace/skills' },
        output: 'github\nmoi-workspace\nsummarize\nweather'
      })
    ],
    14
  ),
  assistantTurn(
    '304',
    304,
    [
      {
        type: 'text',
        text: 'Four skills are installed: `github`, `moi-workspace`, `summarize`, and `weather`.'
      }
    ],
    15
  )
]

// 8a. Image attachment (file part with a data: URI) above the text bubble.
export const CHECKERBOARD_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAIAAABMXPacAAABjUlEQVR4nO3ZsQ3AIBAEwe/XDbscd4BEtEbMFzACbXjzbt6zefz1zekfON0XIPYFiH0BYl+A2Bcg9gWIfQFiX4DYFyD2BYh9AWJfgNgXIPYFiP3524Nu8wWIfQFiX4DYFyD2BYh9AWJfgNgXIPYFiH0BYl+A2Bcg9gWIfQFiX4DYN8jEvgCxL0DsCxD7AsS+ALEvQOwLEPsCxL4AsS9A7AsQ+wLEvgCxL0DsCxD7BpnYFyD2BYh9AWJfgNgXIPYFiH0BYl+A2Bcg9gWIfQFiX4DYFyD2BYh9AWLfIBP7AsS+ALEvQOwLEPsCxL4AsS9A7AsQ+wLEvgCxL0DsCxD7AsS+ALEvQOwbZGJfgNgXIPYFiH0BYl+A2Bcg9gWIfQFiX4DYFyD2BYh9AWJfgNgXIPYFiH2DTOwLEPsCxL4AsS9A7AsQ+wLEvgCxL0DsCxD7AsS+ALEvQOwLEPsCxL4AsW+QiX0BYl+A2Bcg9gWIfQFiX4DYFyD2BYh9AWJfgNgXIPYFiH0BYl+A2Bcg9j8CzCcYf8zaTAAAAABJRU5ErkJggg=='

export const userImageAttachment: Turn = {
  id: `openclaw:${DEV_SESSION_ID}:220`,
  role: 'user',
  origin: { kind: 'user-input' },
  parts: [
    {
      type: 'file',
      mediaType: 'image/png',
      url: CHECKERBOARD_PNG,
      filename: 'pattern.png'
    },
    { type: 'text', text: 'can you recreate this dither pattern in the scratchpad?' }
  ],
  timestamp: at(16),
  seq: 220
}

// 8b. Non-image attachment — renders as a labelled file chip (no usable url:
// the bytes live server-side).
export const userFileAttachment: Turn = {
  id: `openclaw:${DEV_SESSION_ID}:223`,
  role: 'user',
  origin: { kind: 'user-input' },
  parts: [
    { type: 'file', mediaType: 'application/pdf', url: '', filename: 'report.pdf' },
    { type: 'text', text: 'summarize the findings section of this report' }
  ],
  timestamp: at(17),
  seq: 223
}

// ---- Tool calls -------------------------------------------------------------

// Wrap a single tool call in an assistant turn so it renders through the full
// TurnView → TurnParts → ToolCallGroup path, exactly like the live transcript.
function toolTurn(id: string, seq: number, call: ToolCall, offsetMin: number): Turn {
  return assistantTurn(id, seq, [toolPart(call)], offsetMin)
}

// 9. exec waiting to start — no result row yet.
export const execPending = toolTurn(
  '401',
  401,
  {
    toolCallId: 'toolu_01Vg7RcMdXsTn4Qa',
    name: 'exec',
    caller: 'model',
    provider: 'openclaw',
    state: 'pending',
    input: { command: 'ls ~/.openclaw/workspace | wc -l' }
  },
  20
)

// 10. exec mid-flight (a session.tool "running" frame landed).
export const execRunning = toolTurn(
  '403',
  403,
  {
    toolCallId: 'toolu_01Wf2KdNbYuVm8Rb',
    name: 'exec',
    caller: 'model',
    provider: 'openclaw',
    state: 'running',
    input: { command: 'ls ~/.openclaw/workspace | wc -l' }
  },
  21
)

// 11. exec finished with multi-line output.
export const execSuccess = toolTurn(
  '405',
  405,
  {
    toolCallId: 'toolu_01Xd9PeQcZwWk2Sc',
    name: 'exec',
    caller: 'model',
    provider: 'openclaw',
    state: 'success',
    input: { command: 'for i in $(seq 1 12); do echo $i; done' },
    output: '1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n11\n12'
  },
  22
)

// 12. exec failed — errorText renders as the red output body.
export const execError = toolTurn(
  '407',
  407,
  {
    toolCallId: 'toolu_01Yb5QfRdAxXj6Td',
    name: 'exec',
    caller: 'model',
    provider: 'openclaw',
    state: 'error',
    input: { command: 'sleep 45 && echo done' },
    errorText: 'command timed out after 30000ms'
  },
  23
)

// 13. read success — .md path, so the body gets the raw ↔ md highlight switch.
export const readSuccess = toolTurn(
  '409',
  409,
  {
    toolCallId: 'toolu_01Za3RgSeBvYh8Ue',
    name: 'read',
    caller: 'model',
    provider: 'openclaw',
    state: 'success',
    input: { path: '~/.openclaw/workspace/skills/moi-workspace/SKILL.md' },
    output: [
      '---',
      'name: moi-workspace',
      'description: Operate the moi workspace — widgets, views, layout, and chat.',
      '---',
      '',
      '# moi workspace',
      '',
      'Use the `moi` CLI to inspect and modify the workspace this agent runs in.'
    ].join('\n')
  },
  24
)

// 14. write success — content rides on the input, result is a one-liner.
export const writeSuccess = toolTurn(
  '411',
  411,
  {
    toolCallId: 'toolu_01Ab8ShTfCwZk4Vf',
    name: 'write',
    caller: 'model',
    provider: 'openclaw',
    state: 'success',
    input: {
      path: 'notes/summary.md',
      content:
        '# Standup notes\n\n- gateway upgraded to 2026.7.1\n- irc channel routing verified end to end\n- next: clean up the cron probe'
    },
    output: 'Wrote notes/summary.md (114 bytes)'
  },
  25
)

// 15. Native MCP call — server encoded in the name, renders the branded row.
export const mcpGithubGetMe = toolTurn(
  '413',
  413,
  {
    toolCallId: 'toolu_01Bc6TjUgDxAm2Wg',
    name: 'mcp__github__get_me',
    caller: 'model',
    provider: 'claude-code',
    state: 'success',
    input: {},
    output:
      '{"login":"molefrog","id":671276,"profile_url":"https://github.com/molefrog","avatar_url":"https://avatars.githubusercontent.com/u/671276?v=4","details":{"name":"Alexey","location":"Berlin","public_repos":48,"followers":412,"following":18,"created_at":"2011-03-14T09:12:33Z"}}'
  },
  26
)

// 16. Skill launch — "Loading skill" row with the package node on success.
export const skillRow = toolTurn(
  '415',
  415,
  {
    toolCallId: 'toolu_01Cd4UkVhEyBn8Xh',
    name: 'Skill',
    caller: 'model',
    provider: 'claude-code',
    state: 'success',
    input: { skill: 'moi-workspace' },
    skill: { skillName: 'moi-workspace' },
    output: 'Launching skill: moi-workspace'
  },
  27
)

// 17a/17b. Permission gate — the same Bash call waiting for approval and after
// the user declined it.
export const approvalPending = toolTurn(
  '417',
  417,
  {
    toolCallId: 'toolu_01De2VlWiFzCp4Yi',
    name: 'Bash',
    caller: 'model',
    provider: 'claude-code',
    state: 'approval-pending',
    input: { command: 'rm -rf build', description: 'Remove the build directory' }
  },
  28
)

export const approvalDenied = toolTurn(
  '419',
  419,
  {
    toolCallId: 'toolu_01Ef9WmXjGaDq6Zj',
    name: 'Bash',
    caller: 'model',
    provider: 'claude-code',
    state: 'approval-denied',
    input: { command: 'rm -rf build', description: 'Remove the build directory' }
  },
  29
)

// 18. OpenClaw message tool — outbound channel delivery.
export const messageTool = toolTurn(
  '421',
  421,
  {
    toolCallId: 'toolu_01Fg7XnYkHbEr2Ak',
    name: 'message',
    caller: 'model',
    provider: 'openclaw',
    state: 'success',
    input: { to: 'irc:mole', message: 'Hey mole, good to hear!' },
    output: 'Message sent to irc:mole'
  },
  30
)

// ---- Subagents --------------------------------------------------------------

// 19. Running subagent — sport-glyph node, shimmer header, latest progress line.
export const subagentRunning = assistantTurn(
  '501',
  501,
  [
    {
      type: 'reasoning',
      text: 'A quick liveness probe: spawn a subagent and have it answer with one word.'
    },
    toolPart({
      toolCallId: 'toolu_01Gh5YoZlJcFs8Bl',
      name: 'Agent',
      caller: 'subagent',
      provider: 'claude-code',
      state: 'running',
      input: {
        description: 'Reply with the single word: pong',
        prompt: 'Reply with the single word: pong',
        subagent_type: 'general-purpose'
      },
      output: '',
      subagent: {
        taskId: 'task_pong_probe',
        description: 'Reply with the single word: pong',
        status: 'running',
        progress: ['Spawning session…', 'Waiting for reply'],
        transcript: []
      }
    })
  ],
  32
)

// 20. The same probe once it finished: duration badge, expandable nested
// transcript (user prompt → assistant reply), final summary segment.
export const subagentCompleted = toolTurn(
  '503',
  503,
  {
    toolCallId: 'toolu_01Hj3ZpAmKdGt4Cm',
    name: 'Agent',
    caller: 'subagent',
    provider: 'claude-code',
    state: 'success',
    input: {
      description: 'Reply with the single word: pong',
      prompt: 'Reply with the single word: pong',
      subagent_type: 'general-purpose'
    },
    output: 'pong',
    subagent: {
      taskId: 'task_pong_probe',
      description: 'Reply with the single word: pong',
      status: 'completed',
      usage: { totalTokens: 33168, durationMs: 4109 },
      progress: ['Spawning session…', 'Waiting for reply'],
      transcript: [
        {
          id: 'sub-pong-1',
          role: 'user',
          origin: { kind: 'subagent-prompt', parentToolCallId: 'toolu_01Hj3ZpAmKdGt4Cm' },
          parts: [{ type: 'text', text: 'Reply with the single word: pong' }]
        },
        {
          id: 'sub-pong-2',
          role: 'assistant',
          origin: { kind: 'user-input' },
          parts: [
            {
              type: 'reasoning',
              text: 'A single word is requested — reply with exactly "pong".'
            },
            { type: 'text', text: 'pong' }
          ]
        }
      ]
    }
  },
  33
)

// 21. Failed subagent — red node, ✗ marker.
export const subagentFailed = toolTurn(
  '505',
  505,
  {
    toolCallId: 'toolu_01Jk1AqBnLeHu6Dn',
    name: 'Agent',
    caller: 'subagent',
    provider: 'claude-code',
    state: 'error',
    input: {
      description: 'Probe the gateway health endpoint',
      prompt: 'curl the local gateway health endpoint and report the status',
      subagent_type: 'general-purpose'
    },
    errorText: 'Session ended before the task completed',
    subagent: {
      taskId: 'task_gateway_probe',
      description: 'Probe the gateway health endpoint',
      status: 'failed',
      progress: ['Spawning session…', 'Running curl -sf http://127.0.0.1:18789/health'],
      transcript: []
    }
  },
  34
)

// ---- Streaming --------------------------------------------------------------

// 22/23. Live token previews, shaped like the PreviewFrame payloads the server
// pushes (cumulative block text). Fed through buildPreviewTurn so they render
// via the exact preview-turn path ChatPanel uses.
export const textStreamPreview: StreamPreview = {
  messageId: 'msg_01LiveTextFixture',
  parentToolUseId: null,
  blocks: [{ index: 0, kind: 'text', text: 'The moon is Earth’s only natural satellite, quietly' }]
}

export const reasoningStreamPreview: StreamPreview = {
  messageId: 'msg_01LiveThinkFixture',
  parentToolUseId: null,
  blocks: [{ index: 0, kind: 'reasoning', text: 'The user wants a short factual answer. I should' }]
}

// Adapt a wire-shaped preview into the store record buildPreviewTurn takes.
export function toLivePreview(preview: StreamPreview): LivePreview {
  return {
    workspaceId: DEV_WORKSPACE_ID,
    sessionId: DEV_SESSION_ID,
    parentToolUseId: preview.parentToolUseId,
    blocks: preview.blocks,
    updatedAt: T0
  }
}

// Short user turns that sit above the streaming states so they read in context.
export const streamPrompt = userTurn('601', 601, 'tell me about the moon', 40)
export const busyPrompt = userTurn('603', 603, 'give me a workspace status report', 41)

// ---- Notices ----------------------------------------------------------------

export const compactNotice: SystemNotice = {
  id: 'openclaw:compact:640',
  kind: 'compact',
  at: at(45)
}

export const modelChangeNotice: SystemNotice = {
  id: 'openclaw:model-change:642',
  kind: 'model-change',
  at: at(46),
  model: 'claude-sonnet-4-6',
  prev: 'claude-sonnet-5'
}

export const modelChangeNoticeNoPrev: SystemNotice = {
  id: 'openclaw:model-change:644',
  kind: 'model-change',
  at: at(47),
  model: 'claude-sonnet-4-6'
}

// ---- Errors and edge states -------------------------------------------------

// 27. Session error banner copy (chat-store `errors` slice → ChatPanel banner).
export const chatError = 'OpenClaw gateway is not reachable.'

// 28. Gateways report run failures as a plain assistant turn.
export const runFailureTurn = assistantTurn(
  '702',
  702,
  [
    {
      type: 'text',
      text: '⚠️ Agent failed before reply: Unknown model: anthropic/claude-sonnet-5. Run `openclaw models list` to see available ids.'
    }
  ],
  50
)

// ---- Chat selector rows -----------------------------------------------------

const DAY_MS = 86_400_000
const SELECTOR_T0 = T0 + 9 * 3_600_000

// The running row's spinner comes from the live activity store — the page
// seeds `running` for this session id under DEV_WORKSPACE_ID.
export const RUNNING_SELECTOR_SESSION_ID = 'agent:main:webchat-a11f'

export const selectorSessions: SessionInfo[] = [
  {
    sessionId: 'agent:main:webchat-4f21',
    summary: 'Fix the layout save race',
    lastModified: SELECTOR_T0,
    cwd: DEV_CWD
  },
  {
    sessionId: 'agent:main:cron:moi-cron-probe',
    summary: 'Cron: moi-cron-probe',
    lastModified: SELECTOR_T0 - 2 * 3_600_000,
    cwd: DEV_CWD,
    flavor: 'cron'
  },
  {
    sessionId: 'agent:main:subagent:9d2c41',
    summary: 'Subagent task',
    lastModified: SELECTOR_T0 - 3 * 3_600_000,
    cwd: DEV_CWD,
    flavor: 'subagent'
  },
  {
    sessionId: 'agent:main',
    summary: 'mole!mole@127.0.0.1',
    lastModified: SELECTOR_T0 - 5 * 3_600_000,
    cwd: DEV_CWD,
    origin: { provider: 'irc', label: 'mole!mole@127.0.0.1' }
  },
  {
    sessionId: RUNNING_SELECTOR_SESSION_ID,
    summary: 'Rebundle the uptime widget',
    lastModified: SELECTOR_T0 - DAY_MS,
    cwd: DEV_CWD
  }
]
