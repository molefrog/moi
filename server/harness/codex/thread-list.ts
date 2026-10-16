import type { CodexThread } from './adapter'
import type { CodexClient } from './client'
import { readCodexPages } from './pagination'
import { CodexRpcError } from './transport'

type RpcClient = Pick<CodexClient, 'rpc'>

// Codex Desktop labels tasks its agent starts through `create_thread`. moi
// lists only chats a person started.
const AGENT_CREATED_THREAD_SOURCE = 'agent_created_thread'

// Fixed at thread/start, so entries never go stale. thread/list leaves the
// field null (CLI 0.162), so each thread is read once per server process.
const threadSources = new Map<string, string | undefined>()

// The default listing scans every rollout under $CODEX_HOME/sessions, so its
// cost grows with history from all workspaces and can exceed the RPC deadline.
// Only Codex's known database-listing error falls back to the scan. Older CLIs
// ignore useStateDbOnly; transport failures must not trigger another slow lookup.
export async function listCodexThreads(
  client: RpcClient,
  workspacePath: string
): Promise<CodexThread[]> {
  const list = (useStateDbOnly: boolean) =>
    readCodexPages<CodexThread>(client, 'thread/list', {
      cwd: workspacePath,
      limit: 100,
      sortKey: 'updated_at',
      useStateDbOnly
    })
  let threads: CodexThread[]
  try {
    threads = await list(true)
  } catch (err) {
    // CLI 0.162 wraps the rollout error with thread-store context, but supplies
    // no distinct error code for an unavailable DB. Match its specific suffix.
    if (
      !(err instanceof CodexRpcError) ||
      err.code !== -32603 ||
      !err.message.endsWith('failed to list threads from state database')
    )
      throw err
    console.error('[codex] state DB thread/list failed; scanning rollouts', err)
    threads = await list(false)
  }
  return withoutAgentCreatedThreads(client, threads)
}

async function withoutAgentCreatedThreads(
  client: RpcClient,
  threads: CodexThread[]
): Promise<CodexThread[]> {
  for (const thread of threads)
    if (thread.threadSource) threadSources.set(thread.id, thread.threadSource)
  const unknown = threads.filter(thread => !threadSources.has(thread.id))
  let index = 0
  await Promise.all(
    Array.from({ length: Math.min(4, unknown.length) }, async () => {
      while (index < unknown.length) {
        const { id } = unknown[index++]
        try {
          const res = await client.rpc<{ thread?: CodexThread }>('thread/read', {
            threadId: id,
            includeTurns: false
          })
          threadSources.set(id, res.thread?.threadSource ?? undefined)
        } catch {
          // Unread threads stay listed and are retried on the next listing.
        }
      }
    })
  )
  return threads.filter(thread => threadSources.get(thread.id) !== AGENT_CREATED_THREAD_SOURCE)
}
