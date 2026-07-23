/**
 * Trying Mastra's new agent harness (announced June 2026 as "Mastra Harness";
 * since renamed — the canonical class is `AgentController` from
 * `@mastra/core/agent-controller`, with `Harness` kept as a deprecated alias).
 *
 * The demo wires up a tiny "release captain" with two modes and drives one
 * scripted release through the full loop:
 *
 *   - plan mode (default): drafts a plan, only has the read-only tool
 *   - build mode: reads the changelog, then ships — `ship_release` has
 *     `requireApproval: true`, so the run parks on a `tool_approval_required`
 *     event until we respond
 *
 * Runs fully offline: the model is a deterministic script (see
 * scripted-model.ts), so the whole harness — session, modes, event bus, tool
 * approval, LibSQL persistence — runs for real with reproducible output.
 *
 *   bun run demo.ts
 *
 * Run it twice: the second run resumes the first run's thread from
 * harness-demo.db and restores its persisted mode — turn 1 starts in build
 * mode after a process restart. Delete harness-demo.db* to reset.
 */
import { Agent } from '@mastra/core/agent'
import { AgentController, type AgentControllerEvent } from '@mastra/core/agent-controller'
import { createTool } from '@mastra/core/tools'
import { Workspace } from '@mastra/core/workspace'
import { LibSQLStore } from '@mastra/libsql'
import { Memory } from '@mastra/memory'
import { z } from 'zod'

import { BUILD_MODE_MARKER, createScriptedModel, scriptState } from './scripted-model'

const log = (tag: string, detail = '') => console.log(`  [${tag}] ${detail}`.trimEnd())

// --- Tools ------------------------------------------------------------------

const FAKE_CHANGELOG = [
  'Update README: harness icons, features, screenshot grid.',
  'Release v0.4.0',
  'Add workspace widget resize handles'
]

const readChangelog = createTool({
  id: 'read_changelog',
  description: 'Read the most recent entries from the project changelog.',
  inputSchema: z.object({ limit: z.number().int().positive() }),
  execute: async ({ limit }) => {
    scriptState.changelogRead = true
    return { entries: FAKE_CHANGELOG.slice(0, limit) }
  }
})

const shipRelease = createTool({
  id: 'ship_release',
  description: 'Publish a release. Destructive: requires user approval.',
  requireApproval: true,
  inputSchema: z.object({ version: z.string(), notes: z.string() }),
  execute: async ({ version }) => {
    scriptState.shipped = true
    return {
      published: true,
      version,
      url: `https://www.npmjs.com/package/moi-computer/v/${version}`
    }
  }
})

// --- Controller (the artist formerly known as Harness) -----------------------

const storage = new LibSQLStore({
  id: 'harness-demo-storage',
  url: `file:${new URL('./harness-demo.db', import.meta.url).pathname}`
})

const controller = new AgentController({
  id: 'release-captain',
  agent: new Agent({
    id: 'release-captain',
    name: 'release-captain',
    instructions: 'You are the release captain for the moi project.',
    model: createScriptedModel()
  }),
  defaultModeId: 'plan',
  modes: [
    {
      id: 'plan',
      name: 'Plan',
      instructions: '[mode:plan] Draft a release plan. Do not execute anything.',
      tools: { read_changelog: readChangelog }
    },
    {
      id: 'build',
      name: 'Build',
      instructions: `${BUILD_MODE_MARKER} Execute the approved release plan using your tools.`,
      tools: { read_changelog: readChangelog, ship_release: shipRelease }
    }
  ],
  // Sessions refuse to start without a workspace, and a workspace needs at
  // least a filesystem, sandbox, or skills — a skills-only one is the minimal
  // no-op setup (same approach as @mastra/core's own test helper). The skills
  // list must be non-empty, so it points at an empty directory.
  workspace: new Workspace({
    name: 'harness-demo',
    skills: [new URL('./skills', import.meta.url).pathname]
  }),
  storage,
  memory: new Memory({
    storage,
    options: { lastMessages: 10, semanticRecall: false }
  })
})

await controller.init()
const session = await controller.createSession({ resourceId: 'demo-user' })

// The harness gates EVERY tool call by default — not just tools that set
// `requireApproval` — and resolves each one against the session's permission
// rules (per-tool > yolo > category > ask). Granting the read-only tool here
// means only `ship_release` will actually park on an approval below.
session.grantTool('read_changelog')

// --- Event stream -------------------------------------------------------------

const messageText = (message: unknown): string => {
  const parts =
    (message as { content?: { parts?: Array<{ type: string; text?: string }> } }).content?.parts ??
    []
  return parts
    .filter(part => part.type === 'text' && part.text)
    .map(part => part.text)
    .join('')
}

session.subscribe((event: AgentControllerEvent) => {
  switch (event.type) {
    case 'mode_changed':
      log('mode_changed', `${event.previousModeId} → ${event.modeId}`)
      break
    case 'thread_created':
      log('thread_created', event.thread.id)
      break
    case 'agent_start':
      log('agent_start')
      break
    case 'tool_start':
      log('tool_start', `${event.toolName} ${JSON.stringify(event.args)}`)
      break
    case 'tool_approval_required':
      log('tool_approval_required', `${event.toolName} ${JSON.stringify(event.args)}`)
      queueMicrotask(() => {
        log('…approving', event.toolName)
        session.respondToToolApproval({ decision: 'approve' })
      })
      break
    case 'tool_end':
      log('tool_end', `${event.isError ? 'ERROR ' : ''}${JSON.stringify(event.result)}`)
      break
    case 'message_end': {
      // The engine also opens and ends an empty assistant message at the start
      // of each run; skip those to keep the log readable.
      const text = messageText(event.message)
      if (text) log('message_end', JSON.stringify(text))
      break
    }
    case 'agent_end':
      log('agent_end', event.reason ?? '')
      break
    case 'error':
      log('error', event.error.message)
      break
    default:
      break
  }
})

// --- Drive one scripted release ----------------------------------------------

// createSession resumed the most recent thread for this resourceId (creating
// one only on first run) and restored the thread's persisted mode and model,
// so this count stays at 1 across runs while the history accumulates.
const threads = await session.thread.list()
console.log(`\nThreads in storage (including this session's): ${threads.length}`)

console.log(`\n=== Turn 1 — mode: ${session.mode.get()} ===`)
await session.sendMessage({ content: 'We need to get v0.4.1 out the door.' })

console.log('\n=== Switching plan → build ===')
await session.mode.switch({ modeId: 'build' })

console.log(`\n=== Turn 2 — mode: ${session.mode.get()} ===`)
await session.sendMessage({ content: 'Plan approved — ship it.' })

// --- Wrap up -------------------------------------------------------------------

const usage = session.getTokenUsage()
const state = session.displayState.get()
console.log('\n=== Session summary ===')
console.log(`  token usage: ${JSON.stringify(usage)}`)
console.log(`  running: ${state.isRunning}, mode: ${session.mode.get()}`)
console.log(`  threads now: ${(await session.thread.list()).length}`)

await controller.destroy()
await storage.close()
console.log('\nDemo complete.')
