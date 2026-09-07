// One app-server per workspace: environment is fixed at process spawn, while
// threads share the connection. Framing lives in transport.ts; see NOTES.md
// for lifecycle, configuration, and wire-type maintenance.
import type { McpServer, Model, SessionInfo, StreamEvent } from '@/lib/types'

import {
  type CodexModel,
  type CodexThread,
  type SubagentReplay,
  childThreadToSubagentRecord,
  codexModelsToModels,
  codexMcpServerToServer,
  type CodexConfig,
  codexThreadToEvents,
  codexThreadToSessionInfo,
  collectSubagentActivities,
  selectCodexWorkspacePreview
} from './adapter'
import type { WorkspaceActivityPreview } from '../types'
import { findHarnessExecutable, requireHarnessExecutable } from '../executable'
import { createCodexTransport, type Json, type NotificationListener } from './transport'
import { readCodexPages } from './pagination'
import { debug } from '../../debug'
import { tapWire } from '../debug'
import { resolveWorkspaceEnv } from '../../workspace-env'

export type CodexProcessInfo = {
  running: boolean
  pid?: number
  binary: string | null
}

export type CodexProcessSnapshot = {
  workspacePath: string
  pid: number
  startedAt: number
}

export function getCodexProcessInfo(workspacePath: string): Promise<CodexProcessInfo> {
  const rec = clients.get(workspacePath)
  const binary = findHarnessExecutable('codex')
  if (!rec) return Promise.resolve({ running: false, binary })
  return rec
    .then(r => ({ running: r.client.isAlive(), pid: r.proc.pid, binary }))
    .catch(() => ({ running: false, binary }))
}

export type CodexClient = {
  rpc: <T>(method: string, params?: Json) => Promise<T>
  onNotification: (l: NotificationListener) => () => void
  isAlive: () => boolean
  workspacePath: string
  // Whether this app-server accepts `turn/start.additionalContext` (the native
  // per-turn context channel). Resolved from the initialize handshake.
  supportsAdditionalContext: boolean
  // CLI version from the initialize handshake's userAgent; undefined when it
  // could not be parsed.
  cliVersion: string | undefined
}

// Older servers silently ignore additionalContext. Gate by handshake version
// and fall back to a text envelope when support cannot be established.
const ADDITIONAL_CONTEXT_MIN_VERSION = '0.135.0'

// Basic protocol floor, including thread/read; newer features and models may
// require a later CLI. This is not an end-to-end compatibility guarantee.
export const CODEX_MIN_SUPPORTED_VERSION = '0.89.0'

// Accept both codex_cli_rs/<version> and Codex Desktop/<version> user agents.
export function parseCodexCliVersion(userAgent: string | undefined): string | undefined {
  return userAgent?.match(/\/(\d+\.\d+\.\d+)/)?.[1]
}

function versionAtLeast(version: string, min: string): boolean {
  const v = version.split('.').map(Number)
  const m = min.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if (v[i] !== m[i]) return v[i] > m[i]
  }
  return true
}

// Unknown and 0.0.0 development versions cannot establish incompatibility.
export function codexCliOutdated(cliVersion: string | undefined): boolean {
  if (!cliVersion || cliVersion === '0.0.0') return false
  return !versionAtLeast(cliVersion, CODEX_MIN_SUPPORTED_VERSION)
}

export function codexSupportsAdditionalContext(userAgent: string | undefined): boolean {
  const version = parseCodexCliVersion(userAgent)
  return version ? versionAtLeast(version, ADDITIONAL_CONTEXT_MIN_VERSION) : false
}

type ClientRecord = {
  client: CodexClient
  proc: ReturnType<typeof Bun.spawn>
  close: () => void
}

const clients = new Map<string, Promise<ClientRecord>>() // key: workspacePath
const liveProcesses = new Map<
  string,
  {
    proc: ReturnType<typeof Bun.spawn>
    startedAt: number
    isAlive: () => boolean
    close: () => void
  }
>()

export function getCodexProcessSnapshot(): CodexProcessSnapshot[] {
  return [...liveProcesses.entries()]
    .filter(([, process]) => process.isAlive())
    .map(([workspacePath, process]) => ({
      workspacePath,
      pid: process.proc.pid,
      startedAt: process.startedAt
    }))
}

async function startClient(workspacePath: string): Promise<ClientRecord> {
  const bin = requireHarnessExecutable('codex')

  const workspaceEnv = await resolveWorkspaceEnv(workspacePath)
  const startedAt = Date.now()
  const proc = Bun.spawn([bin, 'app-server'], {
    cwd: workspacePath,
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'pipe',
    // MOI_AGENT marks the agent's shells as agent-driven for the moi CLI
    // (see agent-caller.ts).
    env: { ...process.env, ...workspaceEnv, MOI_AGENT: '1' }
  })

  const transport = createCodexTransport({
    stdout: proc.stdout,
    write: async line => {
      proc.stdin.write(line)
      await proc.stdin.flush()
    },
    stop: () => {
      proc.kill()
    },
    tap: (direction, frame) => tapWire(workspacePath, direction, frame)
  })
  transport.onNotification(method => {
    if (method === 'account/updated' || method === 'account/login/completed')
      codexModelCatalogs.delete(client)
    if (method !== '__exit') return
    if (liveProcesses.get(workspacePath)?.proc === proc) liveProcesses.delete(workspacePath)
    debug(`codex app-server exited ws=${workspacePath}`)
  })
  async function drainStderr() {
    const reader = (proc.stderr as ReadableStream<Uint8Array>).getReader()
    const decoder = new TextDecoder()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const text = decoder.decode(value).trim()
      if (text) console.error('[codex stderr]', text)
    }
  }

  const client: CodexClient = {
    rpc: transport.rpc,
    onNotification: transport.onNotification,
    isAlive: transport.isAlive,
    workspacePath,
    supportsAdditionalContext: false,
    cliVersion: undefined
  }
  const record: ClientRecord = { client, proc, close: transport.close }
  liveProcesses.set(workspacePath, {
    proc,
    startedAt,
    isAlive: client.isAlive,
    close: transport.close
  })
  // stdout EOF owns teardown: process exit can precede the final buffered
  // response/notification, which still needs to reach its waiter.
  void drainStderr().catch(() => {})

  // Native context fields require experimentalApi on this connection.
  try {
    const init = await client.rpc<{ userAgent?: string }>('initialize', {
      clientInfo: { name: 'moi', title: 'moi', version: '0.1' },
      capabilities: { experimentalApi: true, requestAttestation: false }
    })
    client.supportsAdditionalContext = codexSupportsAdditionalContext(init?.userAgent)
    client.cliVersion = parseCodexCliVersion(init?.userAgent)
    transport.notify('initialized')
    debug(
      `codex app-server started ws=${workspacePath} bin=${bin} ua=${init?.userAgent ?? 'unknown'} additionalContext=${client.supportsAdditionalContext}`
    )
    return record
  } catch (error) {
    transport.close()
    throw error
  }
}

export async function getCodexClient(workspacePath: string): Promise<CodexClient> {
  const existing = clients.get(workspacePath)
  if (existing) {
    const rec = await existing
    if (rec.client.isAlive()) return rec.client
    // Another caller may already have replaced this dead process.
    if (clients.get(workspacePath) !== existing) return getCodexClient(workspacePath)
    clients.delete(workspacePath)
  }
  const started = startClient(workspacePath)
  clients.set(workspacePath, started)
  try {
    const rec = await started
    if (clients.get(workspacePath) !== started || !rec.client.isAlive()) {
      rec.close()
      throw new Error('Codex startup was cancelled')
    }
    rec.client.onNotification(method => {
      if (method === '__exit' && clients.get(workspacePath) === started)
        clients.delete(workspacePath)
    })
    return rec.client
  } catch (err) {
    if (clients.get(workspacePath) === started) clients.delete(workspacePath)
    throw err
  }
}

// Home-card previews must not spawn an app-server for every workspace.
async function peekCodexClient(workspacePath: string): Promise<CodexClient | null> {
  const existing = clients.get(workspacePath)
  if (!existing) return null
  try {
    const rec = await existing
    return rec.client.isAlive() ? rec.client : null
  } catch {
    return null
  }
}

// The next request spawns with fresh workspace env. Active runs are interrupted.
export function killCodexWorkspace(workspacePath: string): void {
  const rec = clients.get(workspacePath)
  if (!rec) return
  clients.delete(workspacePath)
  liveProcesses.get(workspacePath)?.close()
  void rec.then(r => r.close()).catch(() => {})
}

// Server shutdown: kill every app-server so no codex process is orphaned.
export function killAllCodexClients(): void {
  for (const process of [...liveProcesses.values()]) process.close()
  for (const [path, rec] of clients) {
    clients.delete(path)
    void rec.then(r => r.close()).catch(() => {})
  }
}

// ---- discovery (sessions list / models / cold history) -----------------------

// Threads whose recorded cwd is exactly the workspace path, newest first.
export async function getCodexSessions(workspacePath: string): Promise<SessionInfo[]> {
  try {
    const client = await getCodexClient(workspacePath)
    const threads = await readCodexPages<CodexThread>(client, 'thread/list', {
      cwd: workspacePath,
      limit: 100,
      sortKey: 'updated_at'
    })
    return threads.map(codexThreadToSessionInfo)
  } catch (err) {
    console.error('[codex] thread/list failed', err)
    return []
  }
}

export async function archiveCodexThread(
  client: Pick<CodexClient, 'rpc'>,
  threadId: string
): Promise<void> {
  await client.rpc('thread/archive', { threadId })
}

export async function interruptCodexTurn(
  client: Pick<CodexClient, 'rpc'>,
  threadId: string,
  turnId: string
): Promise<void> {
  await client.rpc('turn/interrupt', { threadId, turnId })
}

export async function archiveCodexSession(workspacePath: string, threadId: string): Promise<void> {
  await archiveCodexThread(await getCodexClient(workspacePath), threadId)
}

// Home-page card preview. Peek-only: with no live app-server the card simply
// omits the activity fields until the workspace is opened once.
export async function getCodexWorkspacePreview(
  workspacePath: string,
  includeFirstUserMessage: boolean
): Promise<WorkspaceActivityPreview> {
  const client = await peekCodexClient(workspacePath)
  if (!client) return {}
  try {
    const res = await client.rpc<{ data?: CodexThread[] }>('thread/list', {
      cwd: workspacePath,
      limit: 50,
      sortKey: 'updated_at'
    })
    return selectCodexWorkspacePreview(res.data ?? [], includeFirstUserMessage)
  } catch {
    return {}
  }
}

// Cache per live client: workspace env/config can select a different account
// or provider. Expiry, login notifications and process replacement refresh it.
const codexModelCatalogs = new WeakMap<
  CodexClient,
  { expiresAt: number; promise: Promise<CodexModel[]> }
>()

export async function getCodexModelCatalog(workspacePath: string): Promise<CodexModel[]> {
  const client = await getCodexClient(workspacePath)
  const cached = codexModelCatalogs.get(client)
  if (cached && cached.expiresAt > Date.now()) return cached.promise
  const promise = readCodexPages<CodexModel>(client, 'model/list', { limit: 100 })
    .then(models => models.filter(model => !model.hidden))
    .catch(err => {
      if (codexModelCatalogs.get(client)?.promise === promise) codexModelCatalogs.delete(client)
      throw err
    })
  codexModelCatalogs.set(client, { expiresAt: Date.now() + 60_000, promise })
  return promise
}

async function getCodexConfig(workspacePath: string): Promise<CodexConfig> {
  try {
    const client = await getCodexClient(workspacePath)
    const res = await client.rpc<{ config?: CodexConfig }>('config/read', {
      cwd: workspacePath,
      includeLayers: false
    })
    return res.config ?? {}
  } catch (err) {
    debug(
      `codex config/read failed cwd=${workspacePath}: ${err instanceof Error ? err.message : String(err)}`
    )
    return {}
  }
}

export async function getCodexModels(workspacePath: string): Promise<Model[]> {
  const [models, config] = await Promise.all([
    getCodexModelCatalog(workspacePath),
    getCodexConfig(workspacePath)
  ])
  return codexModelsToModels(models, config)
}

// Runtime status distinguishes failed/disabled servers from authenticated ones.
export async function getCodexMcpStatus(
  workspacePath: string,
  sessionId?: string
): Promise<McpServer[]> {
  try {
    const client = await getCodexClient(workspacePath)
    const servers = await readCodexPages<{
      name?: string
      authStatus?: string
      runtimeStatus?: string | null
    }>(client, 'mcpServerStatus/list', {
      detail: 'toolsAndAuthOnly',
      ...(sessionId ? { threadId: sessionId } : {})
    })
    return servers
      .filter((s): s is { name: string; authStatus?: string } => typeof s.name === 'string')
      .map(codexMcpServerToServer)
  } catch (err) {
    console.error('[codex] mcpServerStatus/list failed', err)
    return []
  }
}

// Rebuild the SubagentRecords for a replayed parent thread: read each child
// thread announced by a `subAgentActivity` item and fold its transcript into
// a replay record. A child that can't be read just leaves its bare card.
export async function readSubagentRecords(
  client: CodexClient,
  thread: CodexThread
): Promise<Map<string, SubagentReplay>> {
  const map = new Map<string, SubagentReplay>()
  const parentTurnIds = new Set((thread.turns ?? []).map(t => t.id))
  const activities = [
    ...new Map(
      collectSubagentActivities(thread)
        .filter(activity => activity.agentThreadId)
        .map(activity => [activity.agentThreadId, activity])
    ).values()
  ]
  let index = 0
  await Promise.all(
    Array.from({ length: Math.min(4, activities.length) }, async () => {
      while (index < activities.length) {
        const activity = activities[index++]
        const childId = activity.agentThreadId!
        try {
          const res = await client.rpc<{ thread?: CodexThread }>('thread/read', {
            threadId: childId,
            includeTurns: true
          })
          if (res.thread)
            map.set(childId, {
              toolCallId: activity.id,
              record: childThreadToSubagentRecord(res.thread, activity, parentTurnIds)
            })
        } catch {
          // A missing child leaves its activity card; siblings still load.
        }
      }
    })
  )
  return map
}

// Static history replay for the REST events endpoint (no live subscription).
export async function getCodexThreadEvents(
  workspacePath: string,
  threadId: string
): Promise<StreamEvent[]> {
  const client = await getCodexClient(workspacePath)
  const res = await client.rpc<{ thread?: CodexThread }>('thread/read', {
    threadId,
    includeTurns: true
  })
  if (!res.thread) throw new Error('Codex did not return this chat')
  return codexThreadToEvents(res.thread, await readSubagentRecords(client, res.thread))
}
