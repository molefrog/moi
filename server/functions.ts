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
// where the agent works), NOT `.moi/`. But we SPAWN from a neutral cwd and have
// the worker `chdir` there at startup (via MEI_WORKSPACE_ROOT) — otherwise Bun
// would auto-load the workspace's `.env` into the worker, bypassing moi's
// inheritDotenv toggle and per-sink scoping. The `.moi/` root is passed as
// `MEI_FUNCTIONS_DIR` so the worker can locate `.server.ts` files — module keys
// are paths relative to it (`"widgets/hello"` → `.moi/widgets/hello.server.ts`).
// This is the contract documented in the widgets SKILL.
import { LRUCache } from 'lru-cache'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'path'

import { resolveWorkspaceEnv } from './workspace-env'

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
  // Introspection only (surfaced by /status) — not load-bearing.
  ready: boolean
  spawnedAt: number
  lastCallAt: number | null
  calls: number
  errors: number
  timeouts: number
  // Module keys the worker has loaded and cached (reported via 'loaded' IPC,
  // pruned when reloadModules evicts them).
  modules: Set<string>
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

function spawnSlot(workspacePath: string, workspaceEnv: Record<string, string>): Slot {
  const meiDir = join(workspacePath, '.moi')

  let readyResolve: () => void = () => {}
  const readyPromise = new Promise<void>(r => (readyResolve = r))

  const slot: Slot = {
    workspacePath,
    worker: undefined as never,
    readyPromise,
    pending: new Map(),
    killed: false,
    ready: false,
    spawnedAt: Date.now(),
    lastCallAt: null,
    calls: 0,
    errors: 0,
    timeouts: 0,
    modules: new Set()
  }

  slot.worker = Bun.spawn([process.execPath, WORKER_PATH], {
    // Neutral cwd so Bun doesn't auto-load the workspace's `.env`; the worker
    // chdir()s to MEI_WORKSPACE_ROOT at startup to restore cwd = workspace root.
    cwd: tmpdir(),
    // Resolved workspace env (.env + scope-filtered custom secrets) layered over
    // the server's env — the AUTHORITATIVE source now that auto-load is off, so
    // inheritDotenv and per-sink scoping actually hold. MEI_FUNCTIONS_DIR is
    // applied last so a workspace .env can never clobber it; tests set it
    // explicitly to point the worker at fixtures.
    env: {
      ...process.env,
      ...workspaceEnv,
      MEI_WORKSPACE_ROOT: workspacePath,
      MEI_FUNCTIONS_DIR: process.env.MEI_FUNCTIONS_DIR ?? meiDir
    },
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
      const msg = message as {
        type: string
        id?: string
        data?: string
        message?: string
        module?: string
      }

      if (msg.type === 'ready') {
        slot.ready = true
        readyResolve()
        return
      }

      if (msg.type === 'loaded' && msg.module) {
        slot.modules.add(msg.module)
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
          slot.errors++
          p.reject(new Error(msg.message ?? 'Unknown error'))
        }
      }
    }
  })

  return slot
}

function getOrSpawn(workspacePath: string, workspaceEnv: Record<string, string>): Slot {
  const existing = slots.get(workspacePath)
  if (existing && !existing.killed) return existing

  const fresh = spawnSlot(workspacePath, workspaceEnv)
  slots.set(workspacePath, fresh)
  return fresh
}

// Parse the `<module>/<fn>` tail of an RPC URL. The module key may itself
// contain slashes (`widgets/hello/getWeather` → module `widgets/hello`, fn
// `getWeather`), so split on the LAST slash. Returns null on anything that
// isn't a clean path: empty or `..`-ish segments, leading/trailing slashes,
// characters outside [A-Za-z0-9_$-].
export function parseFunctionPath(tail: string): { module: string; name: string } | null {
  const i = tail.lastIndexOf('/')
  if (i === -1) return null
  const module = tail.slice(0, i)
  const name = tail.slice(i + 1)
  if (!/^[A-Za-z0-9_$-]+(?:\/[A-Za-z0-9_$-]+)*$/.test(module)) return null
  if (!/^[A-Za-z0-9_$]+$/.test(name)) return null
  return { module, name }
}

export async function callFunction(
  module: string,
  name: string,
  args: string,
  workspacePath: string
): Promise<string> {
  // Resolve the workspace env before (maybe) spawning, so a fresh worker picks
  // up current .env + custom overrides. Env is fixed at spawn — an already-warm
  // worker keeps its snapshot until restartWorker() reaps it. Widgets only see
  // secrets scoped to the 'widgets' sink.
  const workspaceEnv = await resolveWorkspaceEnv(workspacePath)
  const slot = getOrSpawn(workspacePath, workspaceEnv)
  await slot.readyPromise

  slot.calls++
  slot.lastCallAt = Date.now()

  const id = crypto.randomUUID()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      slot.pending.delete(id)
      slot.timeouts++
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

// Reap a workspace's worker so the next callFunction spawns a fresh one with
// up-to-date env. A running process can't pick up new env vars, so an env
// change (UI override or .env edit) requires this hard restart — distinct from
// reloadModules, which only swaps module code inside the live worker.
export function restartWorker(workspacePath: string) {
  const slot = slots.peek(workspacePath)
  if (slot) killSlot(slot, 'Workspace env changed')
  slots.delete(workspacePath)
}

// Caps surfaced in /status so the numbers there are self-explanatory.
export const WORKER_LIMITS = {
  maxWorkers: MAX_WORKERS,
  idleTtlMs: WORKER_IDLE_TTL_MS,
  callTimeoutMs: CALL_TIMEOUT_MS
} as const

export type WorkerDebugInfo = {
  workspacePath: string
  pid: number | undefined
  ready: boolean
  spawnedAt: number
  lastCallAt: number | null
  calls: number
  errors: number
  timeouts: number
  pending: number
  // ms until the LRU idle TTL reaps this worker (refreshed on every call)
  ttlRemainingMs: number
  // Resident memory of the worker process; null when /proc isn't available (macOS)
  rssBytes: number | null
  modules: string[]
}

// Best-effort RSS from /proc — Linux only, returns null elsewhere. VmRSS is in
// kB, so no page-size assumptions. Sync read of a tiny procfs file is cheap.
function readRss(pid: number | undefined): number | null {
  if (!pid || process.platform !== 'linux') return null
  try {
    const m = readFileSync(`/proc/${pid}/status`, 'utf8').match(/^VmRSS:\s+(\d+)\s+kB/m)
    return m ? Number(m[1]) * 1024 : null
  } catch {
    return null
  }
}

// A snapshot of the live worker pool, for the /status page. Iteration and
// getRemainingTTL don't refresh LRU recency, so peeking is side-effect free.
export function getWorkersDebugSnapshot(): WorkerDebugInfo[] {
  const out: WorkerDebugInfo[] = []
  for (const [workspacePath, slot] of slots.entries()) {
    if (slot.killed) continue
    out.push({
      workspacePath,
      pid: slot.worker.pid,
      ready: slot.ready,
      spawnedAt: slot.spawnedAt,
      lastCallAt: slot.lastCallAt,
      calls: slot.calls,
      errors: slot.errors,
      timeouts: slot.timeouts,
      pending: slot.pending.size,
      ttlRemainingMs: slots.getRemainingTTL(workspacePath),
      rssBytes: readRss(slot.worker.pid),
      modules: [...slot.modules].sort()
    })
  }
  return out
}

export function reloadModules(modules: string[], workspacePath: string) {
  if (modules.length === 0) return
  // peek: don't refresh TTL just because files changed. If the worker was
  // already idle-evicted, the next callFunction will re-spawn fresh anyway.
  const slot = slots.peek(workspacePath)
  if (!slot || slot.killed) return
  try {
    slot.worker.send({ type: 'reload', modules })
    // The worker evicts these from its module cache; it re-reports 'loaded'
    // on the next call, so drop them from the introspection set too.
    for (const m of modules) slot.modules.delete(m)
  } catch {}
}
