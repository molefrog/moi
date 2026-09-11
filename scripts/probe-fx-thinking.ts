// Real reasoning-stream probe through moi's ACP client, session, and adapter.
// Uses the existing fx login without changing profile settings. Each model
// gets an isolated workspace, a 180-second budget, and a cold history load.
// Saves complete wire/client captures and report.json in ~/.cache/moi-fx-thinking-*/.
// Usage: bun scripts/probe-fx-thinking.ts [model-id ...]
// Env: FX_BIN (optional), PROBE_CATALOG (optional moi agent catalog JSON).
import { mkdir, mkdtemp } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

import type { StreamEvent } from '@/lib/types'
import type { AcpProviderConfig } from '../server/harness/acp/session'
import type { AcpModelState } from '../server/harness/acp/wire'
import type { DebugFrame } from '../server/harness/debug'

const cache = join(homedir(), '.cache')
await mkdir(cache, { recursive: true })
const root = await mkdtemp(join(cache, 'moi-fx-thinking-'))
process.env.MOI_DATA_DIR = join(root, 'moi-data')

// Import order avoids the harness registry's circular initialization path.
const { getClientFrameLog, getWireLog } = await import('../server/harness/debug')
const { killAcpWorkspace } = await import('../server/harness/acp/client')
await import('../server/harness/acp/discovery')
const {
  ensureAcpSessionLive,
  forgetAcpWorkspaceSessions,
  getLiveAcpEvents,
  interruptAcpRun,
  sendAcpMessage
} = await import('../server/harness/acp/session')
const { fxConfig } = await import('../server/harness/fx')

const defaultModels = [
  'anthropic/claude-sonnet-5',
  'openai/gpt-5.6-luna',
  'deepseek/deepseek-v3.2-thinking',
  'alibaba/qwen3-235b-a22b-thinking',
  'zai/glm-5.3-flash'
]
const highEffortModels = new Set([
  'anthropic/claude-sonnet-5',
  'openai/gpt-5.6-luna',
  'zai/glm-5.3-flash'
])
const models = process.argv.length > 2 ? process.argv.slice(2) : defaultModels
const prompt =
  'A bag contains 7 red balls and 5 blue balls, shuffled uniformly. Draw without ' +
  'replacement until the third red ball is drawn, then stop. For every blue ball ' +
  'drawn before stopping, flip an independent fair coin. Given that exactly two ' +
  'of those coin flips were heads, what is the probability that the stopping draw ' +
  'was draw number six? Solve without tools or files. Reply only with the reduced fraction.'
// Enumerating the number k of blue balls before the third red gives weights
// C(k+2,2) * C(9-k,4) * C(k,2) / 2^k, for k=2..5; k=3 yields 20/51.
const expectedAnswer = '20/51'

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : undefined
}

function settings(state: AcpModelState) {
  return {
    model: state.currentModelId,
    options: (state.configOptions ?? []).flatMap(option =>
      option.type === 'select' && ['provider', 'model', 'effort'].includes(option.id)
        ? [
            {
              id: option.id,
              currentValue: option.currentValue,
              values: option.options.flatMap(value =>
                'group' in value ? value.options.map(value => value.value) : [value.value]
              )
            }
          ]
        : []
    )
  }
}

function summarizeEvents(events: StreamEvent[]) {
  const parts = events.flatMap(event =>
    event.kind === 'turn' && event.turn.role === 'assistant' ? event.turn.parts : []
  )
  const reasoning = parts.filter(part => part.type === 'reasoning')
  return {
    reasoningParts: reasoning.length,
    reasoningCharacters: reasoning.reduce((sum, part) => sum + part.text.length, 0),
    toolCalls: parts.filter(part => part.type === 'tool-call').length,
    final: parts.flatMap(part => (part.type === 'text' ? [part.text] : [])).join('\n')
  }
}

function normalizedAnswer(answer: string) {
  return answer
    .replace(/\\(?:dfrac|tfrac|frac)\s*\{(\d+)\}\s*\{(\d+)\}/g, '$1/$2')
    .replace(/[\\()[\]$*\s]/g, '')
}

function summarizeWire(wire: DebugFrame[], sessionId: string) {
  const updateTypes: Record<string, number> = {}
  let thoughtCharacters = 0
  for (const entry of wire) {
    const frame = object(entry.frame)
    const params = object(frame?.params)
    if (
      entry.dir !== 'recv' ||
      frame?.method !== 'session/update' ||
      params?.sessionId !== sessionId
    )
      continue
    const update = object(params.update)
    const type = update?.sessionUpdate
    if (typeof type !== 'string') continue
    updateTypes[type] = (updateTypes[type] ?? 0) + 1
    if (type === 'agent_thought_chunk') {
      const text = object(update?.content)?.text
      if (typeof text === 'string') thoughtCharacters += text.length
    }
  }
  return {
    updateTypes,
    thoughtChunks: updateTypes.agent_thought_chunk ?? 0,
    thoughtCharacters
  }
}

if (process.env.PROBE_CATALOG) {
  const catalog: unknown = await Bun.file(process.env.PROBE_CATALOG).json()
  const rows = object(catalog)?.models
  if (!Array.isArray(rows)) throw new Error('PROBE_CATALOG must contain a models array')
  for (const model of models) {
    if (!rows.some(row => object(row)?.value === model)) {
      throw new Error(`Model is absent from the supplied live catalog: ${model}`)
    }
  }
  await Bun.write(join(root, 'catalog.json'), JSON.stringify(catalog, null, 2))
}

async function runModel(model: string, index: number) {
  const directory = join(root, `${index + 1}-${model.replaceAll('/', '-')}`)
  const workspacePath = join(directory, 'workspace')
  await mkdir(workspacePath, { recursive: true })
  const workspaceId = `fx-thinking-${crypto.randomUUID()}`
  const temporaryId = crypto.randomUUID()
  const wire: DebugFrame[] = []
  const client: DebugFrame[] = []
  let wireCursor = 0
  let clientCursor = 0
  let possiblyTruncated = false
  let liveEvents: StreamEvent[] = []
  let replayEvents: StreamEvent[] = []
  let replayStarted = false
  let liveWireLength = 0
  let advertised: ReturnType<typeof settings> | undefined
  let confirmed: ReturnType<typeof settings> | undefined
  const requestedEffort = highEffortModels.has(model) ? 'high' : undefined
  const config: AcpProviderConfig = {
    ...fxConfig,
    modelStateFingerprint: undefined,
    async spawn(ctx) {
      const spec = await fxConfig.spawn(ctx)
      return {
        ...spec,
        command: process.env.FX_BIN ?? spec.command,
        env: { ...spec.env, FX_MODEL: model }
      }
    },
    async applySettings(acp, sessionId, requested, state) {
      advertised = settings(state)
      const next = await fxConfig.applySettings!(acp, sessionId, requested, state)
      confirmed = settings(next)
      return next
    }
  }
  function collect() {
    const nextWire = getWireLog(workspacePath, wireCursor)
    const nextClient = getClientFrameLog(workspaceId, clientCursor)
    // A full ring between polls could have discarded earlier frames. Do not
    // silently claim complete evidence in that case.
    if (nextWire.length >= 1000 || nextClient.length >= 1000) possiblyTruncated = true
    wire.push(...nextWire)
    client.push(...nextClient)
    wireCursor = nextWire.at(-1)?.seq ?? wireCursor
    clientCursor = nextClient.at(-1)?.seq ?? clientCursor
  }
  function realId() {
    collect()
    for (const entry of client) {
      const frame = object(entry.frame)
      if (
        frame?.type === 'session_renamed' &&
        frame.from === temporaryId &&
        typeof frame.to === 'string'
      )
        return frame.to
    }
    return temporaryId
  }
  function cleanup() {
    forgetAcpWorkspaceSessions(workspacePath, 'fx')
    killAcpWorkspace(workspacePath, 'fx')
  }
  const startedAt = Date.now()
  let liveElapsedMs = 0
  let timeout: ReturnType<typeof setTimeout> | undefined
  const failures: string[] = []
  const polling = setInterval(collect, 20)
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      const id = realId()
      if (!replayStarted) liveEvents = getLiveAcpEvents(workspaceId, id) ?? []
      void interruptAcpRun(config, { workspaceId, sessionId: id }).catch(() => {})
      cleanup()
      reject(new Error('Model probe exceeded 180 seconds'))
    }, 180000)
  })
  console.log(`Starting ${model} (${requestedEffort ?? 'advertised default'} effort)`)
  try {
    await Promise.race([
      sendAcpMessage(config, {
        workspaceId,
        workspacePath,
        sessionId: temporaryId,
        isNew: true,
        content: prompt,
        model,
        effort: requestedEffort,
        stream: true
      }),
      deadline
    ])
    liveElapsedMs = Date.now() - startedAt
    const id = realId()
    liveEvents = getLiveAcpEvents(workspaceId, id) ?? []
    console.log(`${model}: live ${JSON.stringify(summarizeEvents(liveEvents))}`)
    collect()
    liveWireLength = wire.length
    if (id !== temporaryId) {
      cleanup()
      replayStarted = true
      replayEvents = await Promise.race([
        ensureAcpSessionLive(config, { workspaceId, workspacePath, sessionId: id }),
        deadline
      ])
    }
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error))
  } finally {
    if (timeout) clearTimeout(timeout)
    clearInterval(polling)
    collect()
    if (!replayStarted) liveWireLength = wire.length
    if (!liveElapsedMs) liveElapsedMs = Date.now() - startedAt
    cleanup()
  }
  const sessionId = realId()
  const live = {
    ...summarizeWire(wire.slice(0, liveWireLength), sessionId),
    ...summarizeEvents(liveEvents)
  }
  const replayWire = wire.slice(liveWireLength)
  const replay = { ...summarizeWire(replayWire, sessionId), ...summarizeEvents(replayEvents) }
  const load = replayWire.find(entry => object(entry.frame)?.method === 'session/load')
  const loaded = replayWire.find(
    entry => entry.dir === 'recv' && object(entry.frame)?.id === object(load?.frame)?.id
  )
  const loadedOptions = object(object(loaded?.frame)?.result)?.configOptions
  const errors = client.flatMap(entry => {
    const frame = object(entry.frame)
    return frame?.kind === 'error' ? [frame.content] : []
  })
  const report = {
    model,
    requestedEffort: requestedEffort ?? 'advertised default',
    advertised,
    confirmed,
    sessionId,
    workspacePath,
    liveElapsedMs,
    totalElapsedMs: Date.now() - startedAt,
    live,
    replay,
    loadedOptions,
    answerCorrect: normalizedAnswer(live.final) === expectedAnswer,
    liveReasoningMatchesWire: live.reasoningCharacters === live.thoughtCharacters,
    replayReasoningMatchesWire: replay.reasoningCharacters === replay.thoughtCharacters,
    replayMatchesLive: replay.final === live.final,
    possiblyTruncated,
    errors,
    failures
  }
  await Promise.all([
    Bun.write(join(directory, 'report.json'), JSON.stringify(report, null, 2)),
    Bun.write(join(directory, 'wire.json'), JSON.stringify(wire, null, 2)),
    Bun.write(join(directory, 'client.json'), JSON.stringify(client, null, 2)),
    Bun.write(join(directory, 'live-events.json'), JSON.stringify(liveEvents, null, 2)),
    Bun.write(join(directory, 'replay-events.json'), JSON.stringify(replayEvents, null, 2))
  ])
  console.log(`${model}: ${JSON.stringify({ live, replay, errors, failures })}`)
  return report
}

console.log(`Evidence: ${root}`)
const results: Awaited<ReturnType<typeof runModel>>[] = []
for (let index = 0; index < models.length; index += 2) {
  results.push(
    ...(await Promise.all(
      models.slice(index, index + 2).map((model, offset) => runModel(model, index + offset))
    ))
  )
  await Bun.write(
    join(root, 'report.json'),
    JSON.stringify({ prompt, expectedAnswer, results }, null, 2)
  )
}
console.log(`Report: ${join(root, 'report.json')}`)
process.exit(
  results.some(
    result =>
      result.failures.length ||
      result.errors.length ||
      result.possiblyTruncated ||
      !result.liveReasoningMatchesWire ||
      !result.replayReasoningMatchesWire
  )
    ? 1
    : 0
)
