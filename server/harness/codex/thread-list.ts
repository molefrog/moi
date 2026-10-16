import type { CodexThread } from './adapter'
import type { CodexClient } from './client'
import { readCodexPages } from './pagination'

type RpcClient = Pick<CodexClient, 'rpc'>

// Codex Desktop labels tasks its agent starts through `create_thread`. moi
// lists only chats a person started.
const AGENT_CREATED_THREAD_SOURCE = 'agent_created_thread'

// Fixed at thread/start, so entries never go stale. thread/list leaves the
// field null (CLI 0.162), so each thread is read once per server process.
const threadSources = new Map<string, string | undefined>()

// The default listing scans every rollout under $CODEX_HOME/sessions, so its
// cost grows with history from all workspaces and can exceed the RPC deadline.
// The state DB answers the same query in milliseconds. An unavailable DB is an
// RPC error, which falls back to the scan; CLIs without the field ignore it.
export async function listCodexThreads(
  client: RpcClient,
  params: Record<string, unknown>,
  { allPages = true }: { allPages?: boolean } = {}
): Promise<CodexThread[]> {
  const list = async (extra: Record<string, unknown>) =>
    allPages
      ? readCodexPages<CodexThread>(client, 'thread/list', { ...params, ...extra })
      : ((await client.rpc<{ data?: CodexThread[] }>('thread/list', { ...params, ...extra }))
          .data ?? [])
  let threads: CodexThread[]
  try {
    threads = await list({ useStateDbOnly: true })
  } catch (err) {
    console.error('[codex] state DB thread/list failed; scanning rollouts', err)
    threads = await list({})
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
