import type { CodexClient } from './client'

// List APIs are cursor-based. A repeated cursor is a protocol failure, not a
// reason to spin indefinitely or quietly return a truncated catalog/history.
export async function readCodexPages<T>(
  client: Pick<CodexClient, 'rpc'>,
  method: string,
  params: Record<string, unknown> = {},
  options?: { timeoutMs?: number; onPage?: (rows: T[]) => void }
): Promise<T[]> {
  const rows: T[] = []
  const cursors = new Set<string>()
  let cursor: string | undefined
  do {
    const page = await client.rpc<{ data?: T[]; nextCursor?: string | null }>(
      method,
      { ...params, ...(cursor ? { cursor } : {}) },
      options?.timeoutMs === undefined ? undefined : { timeoutMs: options.timeoutMs }
    )
    rows.push(...(page.data ?? []))
    options?.onPage?.(page.data ?? [])
    cursor = page.nextCursor || undefined
    if (cursor && cursors.has(cursor)) throw new Error(`Codex ${method} repeated a page cursor`)
    if (cursor) cursors.add(cursor)
  } while (cursor)
  return rows
}
