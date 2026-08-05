// Inline fixtures for the /dev/chat-states catalog: ONE continuous conversation
// that walks through every chat state — a user debugging their workspace with
// the agent. Payload shapes mirror what the live gateways emit (OpenClaw
// message/toolCall shapes, Claude Code MCP naming, subagent task records); all
// content itself is synthetic. Pure data: the page renders it through the REAL
// chat components with no server calls.
//
// Ordering is load-bearing: `seq` and `timestamp` increase monotonically so
// groupTurns merges the intended tool-only runs and interleaveNotices lands
// each notice in its scripted slot (a notice stamped with a turn's own
// timestamp renders just before that turn).
import type { LivePreview } from '@/client/features/chat/chat-store'
import type { Part, SessionInfo, StreamPreview, SystemNotice, ToolCall, Turn } from '@/lib/types'

// Fake workspace identity for context providers and the live activity store.
export const DEV_WORKSPACE_ID = 'dev-chat-states'
export const DEV_SESSION_ID = 'agent:main'
export const DEV_CWD = '/Users/mole/.openclaw/workspace'

// Fixed timeline base so the script is deterministic.
const T0 = Date.UTC(2026, 7, 4, 9, 30, 0)
function at(offsetMin: number): string {
  return new Date(T0 + offsetMin * 60_000).toISOString()
}

function turn(role: 'user' | 'assistant', seq: number, offsetMin: number, parts: Part[]): Turn {
  return {
    id: `openclaw:${DEV_SESSION_ID}:${seq}`,
    role,
    origin: { kind: 'user-input' },
    parts,
    timestamp: at(offsetMin),
    seq
  }
}

function text(value: string): Part {
  return { type: 'text', text: value }
}

function tool(call: ToolCall): Part {
  return { type: 'tool-call', call }
}

// 128px checkerboard PNG, embedded so the image attachment needs no server.
export const CHECKERBOARD_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAIAAABMXPacAAABjUlEQVR4nO3ZsQ3AIBAEwe/XDbscd4BEtEbMFzACbXjzbt6zefz1zekfON0XIPYFiH0BYl+A2Bcg9gWIfQFiX4DYFyD2BYh9AWJfgNgXIPYFiP3524Nu8wWIfQFiX4DYFyD2BYh9AWJfgNgXIPYFiH0BYl+A2Bcg9gWIfQFiX4DYN8jEvgCxL0DsCxD7AsS+ALEvQOwLEPsCxL4AsS9A7AsQ+wLEvgCxL0DsCxD7BpnYFyD2BYh9AWJfgNgXIPYFiH0BYl+A2Bcg9gWIfQFiX4DYFyD2BYh9AWLfIBP7AsS+ALEvQOwLEPsCxL4AsS9A7AsQ+wLEvgCxL0DsCxD7AsS+ALEvQOwbZGJfgNgXIPYFiH0BYl+A2Bcg9gWIfQFiX4DYFyD2BYh9AWJfgNgXIPYFiH2DTOwLEPsCxL4AsS9A7AsQ+wLEvgCxL0DsCxD7AsS+ALEvQOwLEPsCxL4AsW+QiX0BYl+A2Bcg9gWIfQFiX4DYFyD2BYh9AWJfgNgXIPYFiH0BYl+A2Bcg9j8CzCcYf8zaTAAAAABJRU5ErkJggg=='

// ---- Tool calls (in narrative order) ---------------------------------------

const readSkill: ToolCall = {
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
}

const execTwelveLines: ToolCall = {
  toolCallId: 'toolu_01Xd9PeQcZwWk2Sc',
  name: 'exec',
  caller: 'model',
  provider: 'openclaw',
  state: 'success',
  input: { command: 'for i in $(seq 1 12); do echo $i; done' },
  output: '1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n11\n12'
}

// Native MCP call — server encoded in the name, renders the branded row.
const mcpGithubGetMe: ToolCall = {
  toolCallId: 'toolu_01Bc6TjUgDxAm2Wg',
  name: 'mcp__github__get_me',
  caller: 'model',
  provider: 'claude-code',
  state: 'success',
  input: {},
  output:
    '{"login":"molefrog","id":671276,"profile_url":"https://github.com/molefrog","avatar_url":"https://avatars.githubusercontent.com/u/671276?v=4","details":{"name":"Alexey","location":"Berlin","public_repos":48,"followers":412,"following":18,"created_at":"2011-03-14T09:12:33Z"}}'
}

const writeSummary: ToolCall = {
  toolCallId: 'toolu_01Ab8ShTfCwZk4Vf',
  name: 'write',
  caller: 'model',
  provider: 'openclaw',
  state: 'success',
  input: {
    path: 'notes/summary.md',
    content:
      '# Workspace check\n\n- moi-workspace skill 0.4.2 — includes the call-time capture fix\n- probe loop ran clean, 12/12 lines\n- GitHub connector signed in as molefrog'
  },
  output: 'Wrote notes/summary.md (132 bytes)'
}

const execTimeout: ToolCall = {
  toolCallId: 'toolu_01Yb5QfRdAxXj6Td',
  name: 'exec',
  caller: 'model',
  provider: 'openclaw',
  state: 'error',
  input: { command: 'sleep 45 && echo done' },
  errorText: 'command timed out after 30000ms'
}

const cleanupDenied: ToolCall = {
  toolCallId: 'toolu_01Ef9WmXjGaDq6Zj',
  name: 'Bash',
  caller: 'model',
  provider: 'claude-code',
  state: 'approval-denied',
  input: { command: 'rm -rf build', description: 'Remove the build directory' }
}

const skillLaunch: ToolCall = {
  toolCallId: 'toolu_01Cd4UkVhEyBn8Xh',
  name: 'Skill',
  caller: 'model',
  provider: 'claude-code',
  state: 'success',
  input: { skill: 'moi-workspace' },
  skill: { skillName: 'moi-workspace' },
  output: 'Launching skill: moi-workspace'
}

const messageMole: ToolCall = {
  toolCallId: 'toolu_01Fg7XnYkHbEr2Ak',
  name: 'message',
  caller: 'model',
  provider: 'openclaw',
  state: 'success',
  input: { to: 'irc:mole', message: 'Hey mole, good to hear!' },
  output: 'Message sent to irc:mole'
}

const probeFailed: ToolCall = {
  toolCallId: 'toolu_01Jk1AqBnLeHu6Dn',
  name: 'Agent',
  caller: 'subagent',
  provider: 'claude-code',
  state: 'error',
  input: {
    description: 'Reply with the single word: pong',
    prompt: 'Reply with the single word: pong',
    subagent_type: 'general-purpose'
  },
  errorText: 'Session ended before the task completed',
  subagent: {
    taskId: 'task_pong_probe_1',
    description: 'Reply with the single word: pong',
    status: 'failed',
    progress: ['Spawning session…', 'Waiting for reply'],
    transcript: []
  }
}

const probeCompleted: ToolCall = {
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
    taskId: 'task_pong_probe_2',
    description: 'Reply with the single word: pong',
    status: 'completed',
    usage: { totalTokens: 33168, durationMs: 4109 },
    progress: ['Spawning session…', 'Waiting for reply'],
    transcript: [
      {
        id: 'sub-pong-1',
        role: 'user',
        origin: { kind: 'subagent-prompt', parentToolCallId: 'toolu_01Hj3ZpAmKdGt4Cm' },
        parts: [text('Reply with the single word: pong')]
      },
      {
        id: 'sub-pong-2',
        role: 'assistant',
        origin: { kind: 'user-input' },
        parts: [
          { type: 'reasoning', text: 'A single word is requested — reply with exactly "pong".' },
          text('pong')
        ]
      }
    ]
  }
}

// "Now" cluster — everything mid-flight at the bottom of the conversation.
const execCounting: ToolCall = {
  toolCallId: 'toolu_01Vg7RcMdXsTn4Qa',
  name: 'exec',
  caller: 'model',
  provider: 'openclaw',
  state: 'running',
  input: { command: 'ls ~/.openclaw/workspace | wc -l' }
}

const cleanupPending: ToolCall = {
  toolCallId: 'toolu_01De2VlWiFzCp4Yi',
  name: 'Bash',
  caller: 'model',
  provider: 'claude-code',
  state: 'approval-pending',
  input: { command: 'rm -rf build', description: 'Remove the build directory' }
}

const probeRunning: ToolCall = {
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
    taskId: 'task_pong_probe_3',
    description: 'Reply with the single word: pong',
    status: 'running',
    progress: ['Spawning session…', 'Waiting for reply'],
    transcript: []
  }
}

// ---- The conversation -------------------------------------------------------

// Beat 1 — greeting.
const greeting = turn('user', 1, 0, [text('hey! is the gateway still running?')])
const greetingReply = turn('assistant', 2, 0, [
  text(
    'It is — OpenClaw 2026.7.1, main session healthy, last channel activity 09:12. What are we on today?'
  )
])

// Beat 2 — the long markdown question (verbatim in the bubble).
const layoutRaceQuestion = turn('user', 3, 2, [
  text(
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
    ].join('\n')
  )
])

// Beat 3 — collapsed Thought + rich markdown answer.
const layoutRaceAnswer = turn('assistant', 4, 3, [
  {
    type: 'reasoning',
    text: 'Two tabs share one debounce window — the second PUT snapshots a stale cache. The fix is capturing the value at call time, not at fire time. Lay out the sequence before answering.'
  },
  text(
    [
      '## Layout save race',
      '',
      'Here is what happens with two tabs writing at once:',
      '',
      '- tab A saves; its PUT lands and the server layout is now A',
      '- tab B’s debounce fires with a **stale cache snapshot** and PUTs the pre-A layout back',
      '- the `workspace:updated` broadcast then refetches both tabs into the reverted state',
      '',
      '| Step | Tab A | Tab B |',
      '| --- | --- | --- |',
      '| 0.0s | edits grid | idle |',
      '| 0.6s | PUT layout A | — |',
      '| 0.9s | — | edits grid |',
      '| 1.5s | — | PUT stale layout |',
      '',
      'The fix is persisting the value captured at call time instead of reading the cache when the debounce fires — see [WorkspaceLayoutContext.tsx](https://github.com/molefrog/moi):',
      '',
      '```ts',
      'timer.current = setTimeout(() => {',
      '  timer.current = null',
      '  saveRef.current(stripMeta(next)) // `next`, not the cache',
      '}, 600)',
      '```',
      '',
      'Want me to check whether your workspace runs a build with this fix?'
    ].join('\n')
  )
])

// Beat 4 — merged tool-only run: four assistant turns off the wire (Codex-style
// one-message-per-step) that groupTurns folds into a single rail.
const checkAsk = turn('user', 5, 5, [text('yes — run the check, and write down what you find')])
const checkStep1 = turn('assistant', 6, 6, [
  {
    type: 'reasoning',
    text: 'Check the installed skill version first, probe the workspace, confirm the GitHub connector account, then note everything down.'
  },
  tool(readSkill)
])
const checkStep2 = turn('assistant', 7, 7, [tool(execTwelveLines)])
const checkStep3 = turn('assistant', 8, 8, [tool(mcpGithubGetMe)])
const checkStep4 = turn('assistant', 9, 9, [tool(writeSummary)])

// Beat 5 — exec error and the follow-up.
const slownessAsk = turn('user', 10, 10, [
  text('nice. separate thing — saving sometimes feels stuck for ages. can you reproduce a hang?')
])
const timeoutProbe = turn('assistant', 11, 11, [tool(execTimeout)])
const timeoutFollowUp = turn('assistant', 12, 12, [
  text(
    'That probe hit the 30 s exec timeout — the sandbox kills anything longer, so a real hang would die the same way. Your “stuck” saves are more likely the 600 ms debounce plus a slow refetch, not the PUT itself. While I’m here: want me to clear the old build output? It’s full of stale chunks.'
  )
])

// Beat 6 — the user declines, and the queued cleanup shows as denied.
const cleanupDecline = turn('user', 13, 13, [text('not yet — leave build alone for now')])
const cleanupDeniedTurn = turn('assistant', 14, 14, [
  tool(cleanupDenied),
  text('Dropped the cleanup — build stays.')
])

// Beat 7 — a run failure, reported by the gateway as a plain assistant turn.
const moonAsk = turn('user', 15, 16, [text('random one — how far away is the moon, actually?')])
const runFailure = turn('assistant', 16, 17, [
  text(
    '⚠️ Agent failed before reply: Unknown model: anthropic/claude-sonnet-5. Run `openclaw models list` to see available ids.'
  )
])
const retryAsk = turn('user', 17, 18, [text('try again?')])

// Beat 8 — the model switch lands right before the reply that carries full
// TurnMeta. NOTE: the meta payload is kept verbatim from a live capture (model
// 'claude-sonnet-5') even though the notice switches to claude-sonnet-4-6 —
// meta is not rendered anywhere yet, so the transcript stays coherent.
const modelChangeNotice: SystemNotice = {
  id: 'openclaw:model-change:19',
  kind: 'model-change',
  at: at(19),
  model: 'claude-sonnet-4-6',
  prev: 'claude-sonnet-5'
}
const moonReplyWithMeta: Turn = {
  ...turn('assistant', 18, 19, [
    text(
      'The moon orbits at an average distance of 384,400 km — light covers that in about 1.3 seconds. It is tidally locked (we always see the same face), and its gravity drives the ocean tides.'
    )
  ]),
  meta: {
    model: 'claude-sonnet-5',
    provider: 'anthropic',
    stopReason: 'stop',
    usage: { inputTokens: 4, outputTokens: 151, totalTokens: 41811, costUsd: 0.1129 }
  }
}

// Beat 9 — attachments: image thumbnail + non-image file chip on one user turn.
const attachmentsTurn = turn('user', 19, 22, [
  { type: 'file', mediaType: 'image/png', url: CHECKERBOARD_PNG, filename: 'pattern.png' },
  { type: 'file', mediaType: 'application/pdf', url: '', filename: 'report.pdf' },
  text(
    'back to work — mole says the report draft is done. recreate this dither pattern in the scratchpad later, and let him know we got it'
  )
])

// Beat 10 — skill row + message tool in one turn.
const skillAndMessage = turn('assistant', 20, 23, [
  tool(skillLaunch),
  tool(messageMole),
  text(
    'Loaded the workspace skill and queued the pattern for the scratchpad. Told mole we got the report.'
  )
])

// Beat 11 — channel-routed user turn. On the wire this arrived over IRC: the
// session carries origin { provider: 'irc', label: 'mole!mole@127.0.0.1' } and
// the gateway's inbound metadata envelope is stripped at the adapter, so the
// turn itself reads as plain input.
const ircHello = turn('user', 21, 25, [
  text('quick hello over IRC — glad it landed. ping me when the final version ships')
])
const ircReply = turn('assistant', 22, 26, [
  text('Will do — I’ll message you the moment it ships.')
])

// Beat 12 — subagent probes: the first attempt fails, the retry completes.
const probeAsk = turn('user', 23, 28, [
  text('one more — spawn a subagent to check the gateway answers. simple ping-pong is fine')
])
const probeFirstTry = turn('assistant', 24, 29, [
  {
    type: 'reasoning',
    text: 'A liveness probe: spawn a session that must answer with a single word.'
  },
  tool(probeFailed),
  text('The first probe session ended before replying — spawning a fresh one.')
])
const probeSecondTry = turn('assistant', 25, 30, [
  tool(probeCompleted),
  text('Second probe came back clean — “pong” in 4.1 s, 33k tokens total.')
])

// Beat 13 — the gateway compacts the context.
const compactNotice: SystemNotice = {
  id: 'openclaw:compact:31',
  kind: 'compact',
  at: at(31)
}

// Beat 14 — "now": three things in flight, then the live tail.
const wrapUpAsk = turn('user', 26, 32, [
  text(
    'great. before we wrap: count the workspace entries, clear the old build output — go ahead this time — and rerun the probe'
  )
])
const nowCluster = turn('assistant', 27, 33, [
  text('On it — three in flight:'),
  tool(execCounting),
  tool(cleanupPending),
  tool(probeRunning)
])

export const conversationTurns: Turn[] = [
  greeting,
  greetingReply,
  layoutRaceQuestion,
  layoutRaceAnswer,
  checkAsk,
  checkStep1,
  checkStep2,
  checkStep3,
  checkStep4,
  slownessAsk,
  timeoutProbe,
  timeoutFollowUp,
  cleanupDecline,
  cleanupDeniedTurn,
  moonAsk,
  runFailure,
  retryAsk,
  moonReplyWithMeta,
  attachmentsTurn,
  skillAndMessage,
  ircHello,
  ircReply,
  probeAsk,
  probeFirstTry,
  probeSecondTry,
  wrapUpAsk,
  nowCluster
]

export const conversationNotices: SystemNotice[] = [modelChangeNotice, compactNotice]

// TOC jump targets: anchor slug + label, keyed by the timeline item (turn or
// notice) id the anchor should sit before. Merged runs keep their FIRST
// member's id (group-turns), so anchors into merged groups target that id.
export type ConversationAnchor = { anchor: string; label: string; itemId: string }

export const conversationAnchors: ConversationAnchor[] = [
  { anchor: 'greeting', label: 'User turn — short text', itemId: greeting.id },
  { anchor: 'long-markdown', label: 'User turn — long markdown', itemId: layoutRaceQuestion.id },
  { anchor: 'rich-markdown', label: 'Assistant turn — rich markdown', itemId: layoutRaceAnswer.id },
  { anchor: 'tool-runs', label: 'Tool calls — merged run', itemId: checkStep1.id },
  { anchor: 'exec-error', label: 'Tool call — exec error', itemId: timeoutProbe.id },
  { anchor: 'approval-denied', label: 'Tool call — approval denied', itemId: cleanupDeniedTurn.id },
  { anchor: 'run-failure', label: 'Run failure turn', itemId: runFailure.id },
  { anchor: 'model-change', label: 'Notice — model change', itemId: modelChangeNotice.id },
  { anchor: 'attachments', label: 'User turn — attachments', itemId: attachmentsTurn.id },
  { anchor: 'skill-message', label: 'Skill and message tool', itemId: skillAndMessage.id },
  { anchor: 'channel-routed', label: 'User turn — channel-routed', itemId: ircHello.id },
  { anchor: 'subagents', label: 'Subagent cards', itemId: probeAsk.id },
  { anchor: 'compact', label: 'Notice — context compacted', itemId: compactNotice.id },
  { anchor: 'live-tail', label: 'Live tail', itemId: nowCluster.id }
]

// ---- Live tail --------------------------------------------------------------

// Live token previews, shaped like the PreviewFrame payloads the server pushes
// (cumulative block text), cut off mid-sentence. Fed through buildPreviewTurn
// so they render via the exact preview-turn path ChatPanel uses — the
// reasoning-only preview folds into the trailing tool group, the text preview
// stands alone.
export const textStreamPreview: StreamPreview = {
  messageId: 'msg_01LiveTextFixture',
  parentToolUseId: null,
  blocks: [
    {
      index: 0,
      kind: 'text',
      text: 'The count is still running and the probe session is spinning up — the build cleanup is waiting on your'
    }
  ]
}

export const reasoningStreamPreview: StreamPreview = {
  messageId: 'msg_01LiveThinkFixture',
  parentToolUseId: null,
  blocks: [
    {
      index: 0,
      kind: 'reasoning',
      text: 'Three tasks in flight. The count is cheap, the probe takes a few seconds, and the cleanup needs approval first, so I should'
    }
  ]
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

// ---- Errors -----------------------------------------------------------------

// Session error banner copy (chat-store `errors` slice → ChatPanel banner).
export const chatError = 'OpenClaw gateway is not reachable.'

// ---- Chat selector rows -----------------------------------------------------

const SELECTOR_T0 = T0 + 9 * 3_600_000
const DAY_MS = 86_400_000

// The running row's spinner comes from the live activity store — the page
// seeds `running` for this session id under DEV_WORKSPACE_ID.
export const RUNNING_SELECTOR_SESSION_ID = 'agent:main:webchat-a11f'

// The first row doubles as the "current" chat the header trigger shows.
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
