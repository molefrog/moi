# Trying Mastra's agent harness

A standalone experiment with [Mastra's](https://mastra.ai) new agent harness —
announced June 2026 as [Mastra Harness](https://mastra.ai/blog/announcing-agent-harness),
the orchestration layer they extracted from their MastraCode TUI agent. It is
the closest thing in the TypeScript ecosystem to what moi builds on the Claude
Agent SDK: persistent sessions, switchable modes, an event bus a UI renders
from, and a tool-approval gate.

Not part of the moi app — nothing here is imported by `server/` or `client/`.

## Run it

```sh
bun install
bun run demo
```

Runs fully offline: the model is a deterministic script (`scripted-model.ts`)
implementing the AI SDK v5 streaming interface, so the whole harness loop —
session, modes, events, approval, LibSQL persistence — executes for real with
reproducible output. The demo plays a two-mode "release captain": plan mode
drafts a plan; after `session.mode.switch({ modeId: 'build' })` it reads a
changelog and ships a release, parking on a `tool_approval_required` event
until the driver approves. Run it twice: the second run resumes the same
thread from `harness-demo.db` and restores the persisted mode, so turn 1
starts in build mode. `MASTRA_DEMO_DEBUG=1` dumps each prompt the model sees.

## What we learned

**The API has moved since the announcement.** As of `@mastra/core@1.52.0` the
class is `AgentController` from `@mastra/core/agent-controller`; `Harness`
(from `@mastra/core/harness`) survives only as a deprecated alias. The blog's
`harness.sendMessage(...)` surface is gone too: after a multi-session
refactor, the controller owns no conversation of its own — you call
`controller.createSession({ resourceId })` and drive everything through the
session (`session.sendMessage`, `session.mode.switch`, `session.subscribe`,
`session.thread.*`, `session.respondToToolApproval`).

**Every tool call is gated by default.** The approval gate is not opt-in per
tool: each call resolves against session permission rules (per-tool deny >
yolo > per-tool policy > session grant > category > "ask"), so an ungranted
read-only tool parks the run just like a destructive one. The demo grants
`read_changelog` up front (`session.grantTool`) and lets `ship_release` hit
the gate. Category policies (`read`/`edit`/`execute`/`mcp`/`other`) need a
`toolCategoryResolver` in the controller config.

**Sessions require a workspace.** `createSession` throws without one, and a
`Workspace` needs at least a filesystem, sandbox, or skills source; the
minimal no-op is a skills-only workspace pointing at an empty directory (what
Mastra's own test helper does).

**Modes restore across restarts.** The thread persists its mode and per-mode
model in thread settings; resuming a session after a process restart lands in
the mode you left. Mode instructions are injected into the system prompt on
top of the shared backing agent's instructions — per-mode `agent` instances
are deprecated in favor of one `agent` plus per-mode
`instructions`/`tools`/`defaultModelId`.

**Two quirks found while scripting the model** (possibly upstream bugs, worth
re-testing before relying on either):

- On approval-resumed model calls, the system prompt loses the current mode's
  instructions — only the backing agent's base instructions survive the
  resume (`MASTRA_DEMO_DEBUG=1` shows it).
- After a resume, the rebuilt prompt can omit the in-flight run's tool-call /
  tool-result parts entirely, so a model (or script) cannot count on seeing
  its own tool history mid-run. The scripted model tracks progress through
  the demo tools' side effects instead of the prompt.

## How it maps to moi

| Mastra                                          | moi today                                          |
| ----------------------------------------------- | -------------------------------------------------- |
| `AgentController` + `Session`                   | `server/` session over the Claude Agent SDK        |
| `session.subscribe` event bus (35 event types)  | WebSocket broadcast of SDK stream events           |
| `tool_approval_required` + permission rules     | SDK `canUseTool` permission callback               |
| modes (`plan`/`build`, `transitionsTo`)         | SDK permission modes (plan mode)                   |
| LibSQL thread persistence, observational memory | state persistence in `server/`, SDK session resume |

Files: `demo.ts` (wiring + driver), `scripted-model.ts` (deterministic model),
`skills/` (empty; satisfies the workspace requirement).
