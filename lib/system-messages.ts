// Provider-agnostic filtering of system machinery that agent backends leave
// in user-role message text: slash-command records, interrupt markers, local
// command output, injected reminder/hook envelopes. Chat bubbles must show
// only what a person actually typed; everything else is transcript plumbing
// the backend wrote for itself.
//
// The layer is a flat rule registry over plain text — it knows nothing about
// any harness's wire types, so every adapter (and the client, if it ever
// needs to) can share it. Two granularities:
//
//   - `filterSystemText`     one text block → cleaned text ('' when the whole
//                            block is machinery)
//   - `classifySystemMessage` all of a message's text blocks → a synthetic-turn
//                            reason when the message as a whole is machinery
//
// Adapters keep a hide-classified message's raw text and mark the turn
// `origin: { kind: 'synthetic', reason }` — the same treatment the Claude SDK's
// own `isSynthetic` injections get — so nothing renders but nothing is lost.
// A `notify`-classified message instead SURFACES: its machinery is rewritten
// to a short readable sentence and the turn lands as
// `origin: { kind: 'notification' }`, plain text in the flow (a dedicated
// notification block in the UI is planned; the origin is its hook).
//
// Adding rules: append to SYSTEM_TEXT_RULES with a `<provider>:<what>` id.
// Registry order is priority — the first matching hide/notify rule decides the
// block. `hide`/`notify` patterns must match the WHOLE block (`^…$`), and
// tag-shaped ones require every element complete (open + close), so a person
// typing a tag name, pasting an unterminated fragment, or quoting a record
// with commentary around it keeps their bubble. Prose-anchored rules (the
// caveat, the compaction summary) are prefix matches by necessity — the
// accepted tradeoff is that pasting that exact sentence at position 0 hides
// the message. Keep `hide`/`notify` regexes non-global (`.test` on a /g
// regex is stateful) and `strip` regexes global.
//
// Current rules cover Claude Code. Sources: the patterns were verified against
// the `claude` CLI binary's strings and live `~/.claude/projects/*.jsonl`
// transcripts (see harness/claude-code/NOTES.md §4). OpenClaw's inbound-meta
// stripper stays in server/harness/openclaw/strip.ts — it mirrors upstream
// code verbatim and is synced against it, so it does not fold into this
// registry.
import type { SyntheticTurnReason } from './format'

export type SystemTextRule = {
  // Stable `<provider>:<what>` id, for tests and debugging.
  id: string
  // The synthetic-turn reason a consumed match maps onto (lib/format.ts).
  reason: SyntheticTurnReason
} &
  // The whole text block is machinery when `test` matches.
  (
    | { action: 'hide'; test: RegExp }
    // Machinery embedded in otherwise-real text: remove every `pattern` match,
    // keep the rest. A block left empty counts as fully consumed.
    | { action: 'strip'; pattern: RegExp }
    // The whole block is machinery worth SHOWING: `render` turns the raw
    // payload into a short readable sentence for the chat flow.
    | { action: 'notify'; test: RegExp; render: (text: string) => string }
  )

function xmlField(text: string, tag: string): string | undefined {
  const m = text.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))
  return m?.[1].trim() || undefined
}

// `<summary>` is already a human sentence ("Background command "…" completed
// (exit code 0)"); fall back to `<status>` (completed | failed | stopped)
// when a producer omits it.
function renderTaskNotification(text: string): string {
  const summary = xmlField(text, 'summary')
  if (summary) return summary
  const status = xmlField(text, 'status')
  return status ? `Background task ${status}` : 'Background task update'
}

export const SYSTEM_TEXT_RULES: readonly SystemTextRule[] = [
  // -- Claude Code: whole-message records ------------------------------------
  // Slash-command invocation, e.g. `<command-name>/clear</command-name>
  // <command-message>clear</command-message><command-args></command-args>`.
  // Tag order varies across CLI versions; `<command-contents>` carries older
  // expanded-command payloads. The block must be NOTHING BUT complete
  // `<command-*>…</command-*>` elements — a typed message that merely starts
  // with the tag name, or a pasted record followed by a question, keeps its
  // bubble.
  {
    id: 'claude-code:slash-command',
    reason: 'slash-command',
    action: 'hide',
    test: /^\s*(<command-(name|message|args|contents)>[\s\S]*?<\/command-\2>\s*)+$/
  },
  // Output of a local slash command, e.g. `<local-command-stdout>Compacted.
  // ...</local-command-stdout>` — the other half of the invocation record.
  {
    id: 'claude-code:local-command-output',
    reason: 'slash-command',
    action: 'hide',
    test: /^\s*(<local-command-(stdout|stderr)>[\s\S]*?<\/local-command-\2>\s*)+$/
  },
  // Marker the CLI writes when the user aborts a turn (Esc / moi's stop).
  // Full-block match only: someone quoting the marker inside a longer
  // message keeps their bubble.
  {
    id: 'claude-code:interrupt',
    reason: 'interrupt',
    action: 'hide',
    test: /^\s*\[Request interrupted by user( for tool use)?\]\s*$/
  },
  // `!command` bash mode: the input echo and its captured output
  // (`<bash-stdout>…</bash-stdout><bash-stderr>…</bash-stderr>` ride in one
  // message).
  {
    id: 'claude-code:bash-mode',
    reason: 'other',
    action: 'hide',
    test: /^\s*(<bash-(input|stdout|stderr)>[\s\S]*?<\/bash-\2>\s*)+$/
  },
  // `#note` memory mode.
  {
    id: 'claude-code:memory-input',
    reason: 'other',
    action: 'hide',
    test: /^\s*<user-memory-input>[\s\S]*?<\/user-memory-input>\s*$/
  },
  // Background-task completion notices delivered as user turns — surfaced
  // as readable text rather than hidden. Local CC is the bare tag block;
  // cloud harnesses prepend a NOT-USER-INPUT preamble. The test requires a
  // COMPLETE `<task-notification>…</task-notification>` message: a person
  // typing the tag name (or an unterminated fragment) keeps their bubble.
  {
    id: 'claude-code:task-notification',
    reason: 'other',
    action: 'notify',
    test: /^\s*(\[SYSTEM NOTIFICATION - NOT USER INPUT\][\s\S]*)?<task-notification>[\s\S]*<\/task-notification>\s*$/,
    render: renderTaskNotification
  },
  // Preamble injected before replayed local-command messages. `isMeta` in
  // current CLI versions (so usually pre-hidden), but older transcripts
  // carry it unflagged.
  {
    id: 'claude-code:local-command-caveat',
    reason: 'other',
    action: 'hide',
    test: /^\s*Caveat: The messages below were generated by the user while running local commands\./
  },
  // Post-compaction continuation summary. Wording after the first sentence
  // differs across CLI versions; the anchor sentence is stable.
  {
    id: 'claude-code:compact-continuation',
    reason: 'other',
    action: 'hide',
    test: /^\s*This session is being continued from a previous conversation that ran out of context\./
  },
  // -- Claude Code: envelopes embedded in real messages ----------------------
  // Ambient context reminders attached to (or around) typed text. moi's own
  // envelope is stripped more precisely by lib/moi-context.ts before this
  // rule sees the text; this catches every other reminder.
  {
    id: 'claude-code:system-reminder',
    reason: 'system-reminder',
    action: 'strip',
    pattern: /<system-reminder>[\s\S]*?<\/system-reminder>\s*/g
  },
  // UserPromptSubmit hook stdout, appended to the message it ran for.
  {
    id: 'claude-code:prompt-submit-hook',
    reason: 'hook-output',
    action: 'strip',
    pattern: /<user-prompt-submit-hook>[\s\S]*?<\/user-prompt-submit-hook>\s*/g
  }
]

export type SystemTextFilter = {
  // What remains for display — '' when the block was entirely machinery,
  // the readable rendering when a `notify` rule consumed it.
  text: string
  // Rules that consumed the block or stripped something from it, in
  // application order (first entry names the dominant reason; its `action`
  // says whether the block was hidden, rewritten, or partially stripped).
  matched: SystemTextRule[]
}

export function filterSystemText(
  text: string,
  rules: readonly SystemTextRule[] = SYSTEM_TEXT_RULES
): SystemTextFilter {
  for (const rule of rules) {
    if (rule.action === 'hide' && rule.test.test(text)) return { text: '', matched: [rule] }
    if (rule.action === 'notify' && rule.test.test(text)) {
      return { text: rule.render(text), matched: [rule] }
    }
  }
  let out = text
  const matched: SystemTextRule[] = []
  for (const rule of rules) {
    if (rule.action !== 'strip') continue
    const next = out.replace(rule.pattern, '')
    if (next !== out) {
      matched.push(rule)
      out = next
    }
  }
  // Only a touched block gets its edges trimmed — untouched user text keeps
  // its exact spacing.
  return { text: matched.length > 0 ? out.trim() : out, matched }
}

export type SystemMessageVerdict =
  // Transcript plumbing: keep the raw parts, mark the turn synthetic, hide.
  | { kind: 'hide'; reason: SyntheticTurnReason; rules: SystemTextRule[] }
  // A backend notification: show `text` as an `origin: 'notification'` turn.
  | { kind: 'notification'; text: string; rules: SystemTextRule[] }

/**
 * Decide whether a message is, in aggregate, all machinery: every text block
 * either matched a hide/notify rule or was stripped down to nothing, and at
 * least one rule fired. Blocks that were already blank neither veto nor
 * count. Any notify match makes the whole message a notification (its
 * rendered texts joined); real surviving text makes it a normal message.
 */
export function classifySystemMessage(
  texts: readonly string[],
  rules: readonly SystemTextRule[] = SYSTEM_TEXT_RULES
): SystemMessageVerdict | undefined {
  const matched: SystemTextRule[] = []
  const rendered: string[] = []
  for (const text of texts) {
    const f = filterSystemText(text, rules)
    if (f.matched[0]?.action === 'notify') {
      if (f.text.trim()) rendered.push(f.text)
      matched.push(...f.matched)
      continue
    }
    if (f.text.trim() !== '') return undefined
    matched.push(...f.matched)
  }
  if (rendered.length > 0) {
    return { kind: 'notification', text: rendered.join('\n\n'), rules: matched }
  }
  return matched.length > 0
    ? { kind: 'hide', reason: matched[0].reason, rules: matched }
    : undefined
}
