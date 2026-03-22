// Parent-side manager for the functions worker child process.
// Provides callFunction() and reloadModules() for use by the web server.
import { join } from 'path'

const WORKER_PATH = join(import.meta.dir, 'functions-worker.ts')

function getMeiDir() {
  return process.env.MEI_FUNCTIONS_DIR ?? join(import.meta.dir, '..', 'workspace', 'mei')
}

type Pending = {
  resolve: (data: string) => void
  reject: (err: Error) => void
}

let worker: ReturnType<typeof Bun.spawn> | null = null
let readyPromise: Promise<void> | null = null
const pending = new Map<string, Pending>()

function rejectAll(reason: string) {
  for (const [id, { reject }] of pending) {
    reject(new Error(reason))
    pending.delete(id)
  }
}

function spawn() {
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
      if (code !== 0 && code !== null) {
        console.error(`[mei] Functions worker exited with code ${code}, will respawn on next call`)
        rejectAll('Functions worker crashed')
      }
    },
    ipc(message) {
      const msg = message as { type: string; id?: string; data?: string; message?: string }

      if (msg.type === 'ready') {
        readyResolve()
        return
      }

      if (msg.id) {
        const p = pending.get(msg.id)
        if (!p) return
        pending.delete(msg.id)

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
  if (!worker) spawn()
  await readyPromise
}

export async function callFunction(module: string, name: string, args: string): Promise<string> {
  await ensureWorker()

  const id = crypto.randomUUID()
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    worker!.send({ id, type: 'call', module, name, args })
  })
}

export function reloadModules(modules: string[]) {
  if (worker && modules.length > 0) {
    worker.send({ type: 'reload', modules })
  }
}
