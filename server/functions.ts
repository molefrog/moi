// Per-workspace pool of functions worker subprocesses.
//
// Each entry in the LRU cache owns one child process running
// `functions-worker.ts`, scoped to a single workspace. Workers are spawned
// lazily on first call, kept warm for `WORKER_IDLE_TTL_MS`, then reaped by
// the LRU TTL. Up to `MAX_WORKERS` slots coexist; an LRU eviction kills the
// oldest. Switching workspaces no longer kills anything — multiple tabs
// against multiple workspaces stay isolated.
//
// CWD contract: workers run with `cwd = workspacePath` (the workspace root,
// where the agent works), NOT `.widgets/`. The `.widgets/` location is
// passed to the worker as `MEI_FUNCTIONS_DIR` so it can locate `.server.ts`
// files. This is the contract documented in the widgets SKILL.
import { LRUCache } from 'lru-cache'
import { join } from 'path'

const WORKER_PATH = join(import.meta.dir, 'functions-worker.ts')
const CALL_TIMEOUT_MS = 30_000
const WORKER_IDLE_TTL_MS = 10 * 60_000
const MAX_WORKERS = 8

type Pending = {
  resolve: (data: string) => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout>
}

type Slot = {
  workspacePath: string
  worker: ReturnType<typeof Bun.spawn>
  readyPromise: Promise<void>
  pending: Map<string, Pending>
  killed: boolean
}

function rejectAndClearPending(slot: Slot, reason: string) {
  for (const { reject, timer } of slot.pending.values()) {
    clearTimeout(timer)
    reject(new Error(reason))
  }
  slot.pending.clear()
}

function killSlot(slot: Slot, reason: string) {
  if (slot.killed) return
  slot.killed = true
  rejectAndClearPending(slot, reason)
  try {
    slot.worker.kill()
  } catch {}
}

const slots = new LRUCache<string, Slot>({
  max: MAX_WORKERS,
  ttl: WORKER_IDLE_TTL_MS,
  ttlAutopurge: true,
  updateAgeOnGet: true,
  dispose: slot => killSlot(slot, 'Functions worker idle-evicted')
})

function spawnSlot(workspacePath: string): Slot {
  const meiDir = join(workspacePath, '.widgets')

  let readyResolve: () => void = () => {}
  const readyPromise = new Promise<void>(r => (readyResolve = r))

  const slot: Slot = {
    workspacePath,
    worker: undefined as never,
    readyPromise,
    pending: new Map(),
    killed: false
  }

  slot.worker = Bun.spawn([process.execPath, WORKER_PATH], {
    cwd: workspacePath,
    // Default to the workspace's built functions dir, but let an explicitly-set
    // MEI_FUNCTIONS_DIR win (used by tests to point the worker at fixtures).
    env: { ...process.env, MEI_FUNCTIONS_DIR: process.env.MEI_FUNCTIONS_DIR ?? meiDir },
    stderr: 'inherit',
    onExit(_proc, code) {
      if (code !== 0 && code !== null) {
        console.error(`[mei] functions worker for ${workspacePath} exited with code ${code}`)
      }
      // Mark slot dead and reject pending. Then drop from cache without
      // re-disposing (the worker is already gone).
      slot.killed = true
      rejectAndClearPending(slot, 'Functions worker exited')
      if (slots.peek(workspacePath) === slot) slots.delete(workspacePath)
    },
    ipc(message) {
      const msg = message as { type: string; id?: string; data?: string; message?: string }

      if (msg.type === 'ready') {
        readyResolve()
        return
      }

      if (msg.id) {
        const p = slot.pending.get(msg.id)
        if (!p) return
        slot.pending.delete(msg.id)
        clearTimeout(p.timer)

        if (msg.type === 'result') {
          p.resolve(msg.data!)
        } else if (msg.type === 'error') {
          p.reject(new Error(msg.message ?? 'Unknown error'))
        }
      }
    }
  })

  return slot
}

function getOrSpawn(workspacePath: string): Slot {
  const existing = slots.get(workspacePath)
  if (existing && !existing.killed) return existing

  const fresh = spawnSlot(workspacePath)
  slots.set(workspacePath, fresh)
  return fresh
}

export async function callFunction(
  module: string,
  name: string,
  args: string,
  workspacePath: string
): Promise<string> {
  const slot = getOrSpawn(workspacePath)
  await slot.readyPromise

  const id = crypto.randomUUID()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      slot.pending.delete(id)
      reject(new Error(`Function call timed out: ${module}/${name}`))
    }, CALL_TIMEOUT_MS)

    slot.pending.set(id, { resolve, reject, timer })

    try {
      slot.worker.send({ id, type: 'call', module, name, args })
    } catch (err) {
      slot.pending.delete(id)
      clearTimeout(timer)
      reject(err instanceof Error ? err : new Error('Failed to send to worker'))
    }
  })
}

// Kill every live worker. Called from the server's shutdown handler so a
// dev-supervisor restart (or Ctrl-C) never orphans worker child processes.
// killSlot is idempotent, so a dispose() racing in via clear() is harmless.
export function killAllWorkers() {
  for (const slot of slots.values()) killSlot(slot, 'Server shutting down')
  slots.clear()
}

export function reloadModules(modules: string[], workspacePath: string) {
  if (modules.length === 0) return
  // peek: don't refresh TTL just because files changed. If the worker was
  // already idle-evicted, the next callFunction will re-spawn fresh anyway.
  const slot = slots.peek(workspacePath)
  if (!slot || slot.killed) return
  try {
    slot.worker.send({ type: 'reload', modules })
  } catch {}
}
