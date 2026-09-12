// Drive `fx acp` through moi's own ACP layer (client → session → adapter) and
// compare a tool-calling turn's live view with the view rebuilt from a cold
// `session/load` — the lossy-replay issue vercel-labs/fx#624, fixed upstream by
// vercel-labs/fx#788. The evidence behind the fx bullets in
// server/harness/acp/NOTES.md §4.
//
// Usage:
//   bun scripts/probe-fx-acp.ts          # gateway key when set, fake otherwise
//   bun scripts/probe-fx-acp.ts --fake   # fx's fake-gateway shape, no key
//   bun scripts/probe-fx-acp.ts --real   # existing fx login; saves a test chat
//
// Env: FX_BIN (default `fx` on PATH), AI_GATEWAY_API_KEY (real gateway),
//      PROBE_MODEL (default anthropic/claude-sonnet-5), PROBE_EFFORT (optional).
//      Fake/key runs isolate HOME. --real uses the existing fx profile and a
//      disposable workspace, without changing its provider or settings.
//
// Exit code 1 when the replayed view lost the tool call.

import { mkdir, mkdtemp, realpath, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { StreamEvent } from '@/lib/types'
import type { AcpProviderConfig } from '../server/harness/acp/session'

// moi's persistence modules read MOI_DATA_DIR at import time, so the probe's
// scratch dir must be in place before they load — hence the dynamic imports.
const dataDir = await mkdtemp(join(tmpdir(), 'fx-probe-data-'))
process.env.MOI_DATA_DIR = dataDir
const { getClientFrameLog, getWireLog } = await import('../server/harness/debug')
const { killAllAcpClients } = await import('../server/harness/acp/client')
const { listAcpSessions } = await import('../server/harness/acp/discovery')
const { ensureAcpSessionLive, forgetAllAcpSessions, getLiveAcpEvents, sendAcpMessage } =
  await import('../server/harness/acp/session')
const { fxConfig } = await import('../server/harness/fx')

const FX_BIN = process.env.FX_BIN ?? Bun.which('fx')
if (!FX_BIN) {
  console.error('fx not found — run curl -fsSL https://fx.sh/setup.sh | bash or set FX_BIN')
  process.exit(1)
}
const realKey = process.env.AI_GATEWAY_API_KEY
const useLogin = process.argv.includes('--real') && !realKey
const useFake = process.argv.includes('--fake') || (!realKey && !useLogin)

const NOTE = 'ACP_LOAD_REPLAY_CONTENT'
const ANSWER = 'ACP_LOAD_REPLAY_ANSWER'
const PROMPT = 'Read replay-note.txt with the read_file tool and quote its content back to me.'
const FAKE_MODEL = 'openai/gpt-5'

type SseEvent = Record<string, unknown>

function sse(events: SseEvent[]): Response {
  const body = `${events.map(e => `data: ${JSON.stringify(e)}\n\n`).join('')}data: [DONE]\n\n`
  return new Response(body, { headers: { 'content-type': 'text/event-stream' } })
}

function toolCall(toolCallId: string, toolName: string, input: Record<string, unknown>) {
  return sse([
    { type: 'tool-call', toolCallId, toolName, input },
    { type: 'finish', finishReason: { unified: 'tool-calls', raw: 'tool-calls' } }
  ])
}

// The gateway shape fx's own e2e suite fakes (tests/e2e/tmux-helpers.ts):
// a models catalog, the coding-agent chat endpoint answering from a queue, and
// separate background title generation and permission-classifier responses.
function startFakeGateway() {
  const chatRequests: Record<string, unknown>[] = []
  const completions = [
    () => toolCall('replay_call_1', 'read_file', { path: 'replay-note.txt' }),
    () =>
      sse([
        { type: 'text-delta', id: 'answer_1', delta: ANSWER },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: 'stop' },
          usage: { inputTokens: { total: 3 }, outputTokens: { total: 5 } }
        }
      ])
  ]
  const server = Bun.serve({
    port: 0,
    idleTimeout: 0,
    async fetch(req) {
      const { pathname } = new URL(req.url)
      if (req.method === 'GET' && pathname === '/coding-agent/v1/models') {
        return Response.json({
          data: [
            {
              id: FAKE_MODEL,
              type: 'language',
              tags: ['tool-use'],
              reasoning_options: [{ type: 'effort', values: ['low', 'high'] }]
            }
          ]
        })
      }
      if (req.method !== 'POST') return new Response('not found', { status: 404 })
      const body = await req.text()
      if (
        body.includes(
          'Generate a short title for a conversation that begins with the user message below.'
        )
      ) {
        return sse([
          { type: 'text-delta', id: 'title_1', delta: 'Read replay note' },
          { type: 'finish', finishReason: { unified: 'stop', raw: 'stop' } }
        ])
      }
      if (body.includes('"permission_decision"')) {
        return toolCall('permission_decision_1', 'permission_decision', {
          risk: 'low',
          decision: 'clear',
          rationale: 'probe fixture'
        })
      }
      chatRequests.push(JSON.parse(body) as Record<string, unknown>)
      const next = completions.shift()
      return next ? next() : new Response('unexpected request', { status: 500 })
    }
  })
  const baseUrl = `http://127.0.0.1:${server.port}`
  return {
    baseUrl,
    chatRequests,
    env: {
      AI_GATEWAY_API_KEY: 'fake-probe-key',
      VERCEL_OIDC_TOKEN: '',
      FX_GATEWAY_BASE_URL: baseUrl,
      FX_GATEWAY_CHAT_URL: `${baseUrl}/v4/ai/language-model`,
      FX_MODEL: FAKE_MODEL
    },
    stop: () => server.stop(true)
  }
}

type PartSummary =
  | {
      role: string
      part: 'tool-call'
      name: string
      state: string
      input: unknown
      output?: string
    }
  | { role: string; part: 'text' | 'reasoning'; text: string }
  | { role: string; part: string }
  | { kind: string }

function summarize(events: StreamEvent[]): PartSummary[] {
  return events.flatMap((e): PartSummary[] => {
    if (e.kind !== 'turn') return [{ kind: e.kind }]
    return e.turn.parts.map((p): PartSummary => {
      if (p.type === 'tool-call') {
        const { name, state, input, output } = p.call
        return {
          role: e.turn.role,
          part: 'tool-call',
          name,
          state,
          input,
          ...(typeof output === 'string' ? { output } : {})
        }
      }
      if (p.type === 'text' || p.type === 'reasoning') {
        return { role: e.turn.role, part: p.type, text: p.text.slice(0, 200) }
      }
      return { role: e.turn.role, part: p.type }
    })
  })
}

function isToolPart(p: PartSummary): p is Extract<PartSummary, { part: 'tool-call' }> {
  return 'part' in p && p.part === 'tool-call'
}

const root = await realpath(await mkdtemp(join(tmpdir(), 'fx-probe-')))
const home = useLogin ? process.env.HOME! : join(root, 'home')
const workspacePath = join(root, 'workspace')
await mkdir(join(home, '.fx'), { recursive: true })
await mkdir(workspacePath, { recursive: true })
await writeFile(join(workspacePath, 'replay-note.txt'), `${NOTE}\n`)

const gateway = useFake ? startFakeGateway() : null
const gatewayEnv: Record<string, string> = gateway
  ? gateway.env
  : {
      ...(realKey ? { AI_GATEWAY_API_KEY: realKey } : {}),
      FX_MODEL: process.env.PROBE_MODEL ?? 'anthropic/claude-sonnet-5'
    }

const config: AcpProviderConfig = {
  ...fxConfig,
  modelStateFingerprint: undefined,
  async applySettings(client, sessionId, settings, state) {
    const options = state.configOptions?.filter(option => option.id === 'effort')
    console.log('advertised effort:', JSON.stringify(options ?? []))
    const confirmed = await fxConfig.applySettings!(client, sessionId, settings, state)
    console.log('confirmed model:', confirmed.currentModelId)
    console.log(
      'confirmed effort:',
      confirmed.configOptions?.find(option => option.id === 'effort')?.currentValue ??
        '(unavailable)'
    )
    return confirmed
  },
  spawn: async () => ({
    provider: 'fx',
    command: FX_BIN,
    args: ['acp'],
    workspacePath,
    env: {
      HOME: home,
      FX_AUTO_UPGRADE: '0',
      ...(!useLogin ? { FX_DISABLE_KEYCHAIN: '1' } : {}),
      FX_SKIP_ONBOARDING: '1',
      NO_COLOR: '1',
      ...gatewayEnv
    }
  })
}
const workspaceId = 'ws-fx-probe'

const status = await Bun.$`${FX_BIN} status`
  .env({ ...process.env, HOME: home })
  .nothrow()
  .text()
const revision = status.match(/build_revision=(\S+)/)?.[1] ?? '(unknown)'
console.log(`fx binary   ${FX_BIN}`)
console.log(`fx revision ${revision}`)
console.log(
  gateway
    ? `gateway     fake (${gateway.baseUrl})${realKey ? '' : ' — no AI_GATEWAY_API_KEY in env'}`
    : `gateway     ${useLogin ? 'existing fx login' : 'Vercel AI Gateway'}, model ${gatewayEnv.FX_MODEL}`
)

let lossy = true
try {
  console.log('\n== 1. live turn (session/new + session/prompt)')
  const tmpId = crypto.randomUUID()
  await sendAcpMessage(config, {
    workspaceId,
    workspacePath,
    sessionId: tmpId,
    isNew: true,
    content: PROMPT,
    ...(process.env.PROBE_EFFORT ? { effort: process.env.PROBE_EFFORT } : {})
  })
  const frames = getClientFrameLog(workspaceId).map(f => f.frame as Record<string, unknown>)
  const renamed = frames.find(f => f.type === 'session_renamed')
  const realId = typeof renamed?.to === 'string' ? renamed.to : tmpId
  const errors = frames.filter(f => f.kind === 'error')
  if (errors.length) console.log('errors:', JSON.stringify(errors))
  console.log(`session ${realId}`)
  const live = summarize(getLiveAcpEvents(workspaceId, realId) ?? [])
  console.log(JSON.stringify(live, null, 2))

  console.log('\n== 2. kill the fx process, cold-load via session/load')
  forgetAllAcpSessions()
  killAllAcpClients()
  await Bun.sleep(300)
  const listed = await listAcpSessions(config, { workspaceId, workspacePath })
  const discovered = listed.some(session => session.sessionId === realId)
  console.log(
    `session/list: ${listed.map(s => `${s.sessionId} "${s.summary}"`).join(', ') || '(none)'}`
  )
  const wireStart = getWireLog(workspacePath).at(-1)?.seq ?? 0
  const replayed = summarize(
    await ensureAcpSessionLive(config, { workspaceId, workspacePath, sessionId: realId })
  )
  console.log(JSON.stringify(replayed, null, 2))

  console.log('\n== 3. raw session/update frames received during session/load')
  for (const f of getWireLog(workspacePath, wireStart)) {
    const msg = f.frame as { method?: string; params?: { update?: unknown } }
    if (f.dir !== 'recv' || msg.method !== 'session/update') continue
    const text = JSON.stringify(msg.params?.update ?? {})
    console.log(text.length > 400 ? `${text.slice(0, 400)}…` : text)
  }

  console.log('\n== verdict')
  const liveTools = live.filter(isToolPart)
  const replayTools = replayed.filter(isToolPart)
  const flattened = replayed.some(
    p =>
      'part' in p && p.part === 'text' && 'text' in p && p.text.includes('Previous tool execution')
  )
  console.log(`live tool-call turns      ${liveTools.length}`)
  console.log(`replayed tool-call turns  ${replayTools.length}`)
  console.log(`flattened tool text       ${flattened}`)
  console.log(`saved session discovered ${discovered}`)
  const requestedEffort = process.env.PROBE_EFFORT
  const loadedEffort = getWireLog(workspacePath, wireStart)
    .flatMap(frame => {
      const message = frame.frame as {
        result?: { configOptions?: { id: string; currentValue: unknown }[] }
      }
      return frame.dir === 'recv' ? (message.result?.configOptions ?? []) : []
    })
    .find(option => option.id === 'effort')?.currentValue
  const effortPersisted = !requestedEffort || loadedEffort === requestedEffort
  if (requestedEffort) console.log(`effort retained after cold load ${effortPersisted}`)
  const effortSent =
    !gateway ||
    !requestedEffort ||
    (gateway.chatRequests.length > 0 &&
      gateway.chatRequests.every(body => body.reasoning === requestedEffort))
  if (gateway && requestedEffort) {
    console.log(
      `chat request reasoning   ${JSON.stringify(gateway.chatRequests.map(body => body.reasoning))}`
    )
    console.log(`requested effort reached model ${effortSent}`)
  }
  lossy =
    liveTools.length === 0 ||
    replayTools.length !== liveTools.length ||
    flattened ||
    !discovered ||
    !effortSent ||
    !effortPersisted ||
    !replayTools.every(t => t.state === 'success' && (t.output ?? '').includes(NOTE))
  console.log(lossy ? 'RESULT: replay is lossy' : 'RESULT: replay keeps structured tool calls')
} finally {
  forgetAllAcpSessions()
  killAllAcpClients()
  gateway?.stop()
}
process.exit(lossy ? 1 : 0)
