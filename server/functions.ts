// Parent-side manager for the functions worker child process.
import { join } from 'path'

const WORKER_PATH = join(import.meta.dir, 'functions-worker.ts')
const CALL_TIMEOUT_MS = 30_000

function getMeiDir() {
  return process.env.MEI_FUNCTIONS_DIR ?? join(import.meta.dir, '..', 'workspace', 'mei')
}

type Pending = {
  resolve: (data: string) => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout>
}

let worker: ReturnType<typeof Bun.spawn> | null = null
let readyPromise: Promise<void> | null = null
let spawning = false
const pending = new Map<string, Pending>()

function rejectAll(reason: string) {
  const entries = [...pending.values()]
  pending.clear()
  for (const { reject, timer } of entries) {
    clearTimeout(timer)
    reject(new Error(reason))
  }
}

function spawn() {
  if (spawning) return
  spawning = true

  let readyResolve: () => void
  readyPromise = new Promise(r => (readyResolve = r))

  const meiDir = getMeiDir()
  worker = Bun.spawn([process.execPath, WORKER_PATH], {
    cwd: meiDir,
    env: { ...process.env, MEI_FUNCTIONS_DIR: meiDir },
    stderr: 'inherit',
    onExit(_proc, code) {
      worker = null
      readyPromise = null
      spawning = false
      if (code !== 0 && code !== null) {
        console.error(`[mei] Functions worker exited with code ${code}`)
      }
      rejectAll('Functions worker exited')
    },
    ipc(message) {
      const msg = message as { type: string; id?: string; data?: string; message?: string }

      if (msg.type === 'ready') {
        spawning = false
        readyResolve()
        return
      }

      if (msg.id) {
        const p = pending.get(msg.id)
        if (!p) return
        pending.delete(msg.id)
        clearTimeout(p.timer)

        if (msg.type === 'result') {
          p.resolve(msg.data!)
        } else if (msg.type === 'error') {
          p.reject(new Error(msg.message ?? 'Unknown error'))
        }
      }
    }
  })
}

async function ensureWorker() {
  if (!worker && !spawning) spawn()
  await readyPromise
}

export async function callFunction(module: string, name: string, args: string): Promise<string> {
  await ensureWorker()

  const id = crypto.randomUUID()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error(`Function call timed out: ${module}/${name}`))
    }, CALL_TIMEOUT_MS)

    pending.set(id, { resolve, reject, timer })

    try {
      if (!worker) throw new Error('Worker not available')
      worker.send({ id, type: 'call', module, name, args })
    } catch (err) {
      pending.delete(id)
      clearTimeout(timer)
      reject(err instanceof Error ? err : new Error('Failed to send to worker'))
    }
  })
}

export function reloadModules(modules: string[]) {
  if (worker && modules.length > 0) {
    try {
      worker.send({ type: 'reload', modules })
    } catch {}
  }
}
