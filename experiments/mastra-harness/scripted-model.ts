import type { Agent } from '@mastra/core/agent'

/**
 * A deterministic, offline stand-in for a real LLM.
 *
 * Implements the AI SDK v5 `LanguageModelV2` streaming surface that Mastra
 * agents accept, and plays a fixed script:
 *
 *   1. plan mode                → streams a release plan (text only)
 *   2. build mode, fresh turn   → calls the `read_changelog` tool
 *   3. changelog has been read  → calls `ship_release` (gated by approval)
 *   4. release has shipped      → streams the final wrap-up text
 *
 * Step 2 is detected from the prompt: AgentController injects the *current
 * mode's* instructions into the system prompt, so the `[mode:build]` marker
 * only appears after `session.mode.switch({ modeId: 'build' })`. That the
 * script behaves differently per mode is itself a check that per-mode
 * instructions flow through to the model.
 *
 * Steps 3–4 are detected through `scriptState`, which the demo's tools flip
 * as they execute. Progress deliberately does NOT rely on reading tool
 * results back out of the prompt: on approval-resumed calls the harness
 * rebuilds the prompt from persisted history, which does not include the
 * in-flight tool parts (see README findings).
 */

export const BUILD_MODE_MARKER = '[mode:build]'

/** Shared progress flags; the demo's tools flip these as they execute. */
export const scriptState = {
  changelogRead: false,
  shipped: false
}

const PLAN_TEXT = [
  'Here is my release plan for v0.4.1:',
  '1. Read the recent changelog entries to draft release notes.',
  '2. Ship the release with `ship_release` (this will ask for your approval).',
  'Switch me to build mode when you want me to execute.'
].join('\n')

const FINAL_TEXT =
  'Done — v0.4.1 is out. I read the changelog, drafted the notes, and ' +
  'published after you approved the ship_release call.'

type ScriptedTurn =
  | { kind: 'text'; text: string }
  | { kind: 'tool-call'; toolCallId: string; toolName: string; input: Record<string, unknown> }

/** Decide what the "model" says next. */
function nextTurn(promptJson: string): ScriptedTurn {
  if (scriptState.shipped) {
    return { kind: 'text', text: FINAL_TEXT }
  }
  if (scriptState.changelogRead) {
    return {
      kind: 'tool-call',
      toolCallId: 'call-ship-release-1',
      toolName: 'ship_release',
      input: { version: '0.4.1', notes: 'Harness icons, feature grid, screenshot updates.' }
    }
  }
  if (promptJson.includes(BUILD_MODE_MARKER)) {
    return {
      kind: 'tool-call',
      toolCallId: 'call-read-changelog-1',
      toolName: 'read_changelog',
      input: { limit: 3 }
    }
  }
  return { kind: 'text', text: PLAN_TEXT }
}

type V2StreamChunk = Record<string, unknown>

function chunksFor(turn: ScriptedTurn): V2StreamChunk[] {
  const head: V2StreamChunk[] = [
    { type: 'stream-start', warnings: [] },
    {
      type: 'response-metadata',
      id: 'scripted-response',
      modelId: 'release-captain-script',
      timestamp: new Date(0)
    }
  ]
  const usage = { inputTokens: 120, outputTokens: 45, totalTokens: 165 }

  if (turn.kind === 'text') {
    const words = turn.text.split(' ')
    return [
      ...head,
      { type: 'text-start', id: 'text-1' },
      ...words.map((word, i) => ({
        type: 'text-delta',
        id: 'text-1',
        delta: i === words.length - 1 ? word : `${word} `
      })),
      { type: 'text-end', id: 'text-1' },
      { type: 'finish', finishReason: 'stop', usage }
    ]
  }

  const inputJson = JSON.stringify(turn.input)
  return [
    ...head,
    { type: 'tool-input-start', id: turn.toolCallId, toolName: turn.toolName },
    { type: 'tool-input-delta', id: turn.toolCallId, delta: inputJson },
    { type: 'tool-input-end', id: turn.toolCallId },
    { type: 'tool-call', toolCallId: turn.toolCallId, toolName: turn.toolName, input: inputJson },
    { type: 'finish', finishReason: 'tool-calls', usage }
  ]
}

function streamFromChunks(chunks: V2StreamChunk[]): ReadableStream<V2StreamChunk> {
  return new ReadableStream<V2StreamChunk>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk)
      controller.close()
    }
  })
}

type AgentModel = ConstructorParameters<typeof Agent>[0]['model']

let debugCallCount = 0

export function createScriptedModel(): AgentModel {
  const model = {
    specificationVersion: 'v2' as const,
    provider: 'scripted',
    modelId: 'release-captain-script',
    supportedUrls: {},
    async doGenerate(): Promise<never> {
      throw new Error('The scripted model only implements doStream.')
    },
    async doStream(options: { prompt: unknown }) {
      const promptJson = JSON.stringify(options.prompt)
      const turn = nextTurn(promptJson)
      if (process.env.MASTRA_DEMO_DEBUG) {
        console.error(`\n--- doStream #${++debugCallCount} → ${JSON.stringify(turn).slice(0, 120)}`)
        console.error(promptJson.slice(0, 4000))
      }
      return {
        stream: streamFromChunks(chunksFor(turn)),
        rawCall: { rawPrompt: null, rawSettings: {} },
        warnings: []
      }
    }
  }
  // @mastra/core does not export the AI SDK v5 stream-part union its vendored
  // types check against, so the scripted chunks are typed loosely and bridged
  // here instead of re-declaring that union by hand.
  return model as unknown as AgentModel
}
