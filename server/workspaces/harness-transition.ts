import type { WorkspaceEntry } from '@/lib/types'

const operations = new Map<string, number>()
const switching = new Set<string>()
export class HarnessTransitionError extends Error {}

export function reserveWorkspaceOperation(id: string): () => void {
  if (switching.has(id)) throw new HarnessTransitionError('Agent is changing. Try again')
  operations.set(id, (operations.get(id) ?? 0) + 1)
  return () => {
    const count = (operations.get(id) ?? 1) - 1
    if (count) operations.set(id, count)
    else operations.delete(id)
  }
}

export async function withHarnessTransition<T>(
  ws: WorkspaceEntry,
  operation: () => Promise<T>
): Promise<T> {
  if (switching.has(ws.id) || operations.has(ws.id))
    throw new HarnessTransitionError('Workspace is busy. Try again when the agent is idle')
  switching.add(ws.id)
  try {
    return await operation()
  } finally {
    switching.delete(ws.id)
  }
}
