// Out-of-process applet compiler.
//
// `Bun.build` shares one process-wide resolver cache with the runtime module
// loader: `node_modules` directory listings, `package.json` contents, and —
// crucially — FAILED bare-specifier lookups are memoized for the life of the
// process and never invalidated (still true in Bun 1.4). The moi server is
// long-lived, so an in-process build that once failed with `Could not resolve
// "pkg"` keeps failing for that specifier after the agent runs `bun add pkg`,
// and a workspace that gains its own `node_modules` (or bumps a package's
// `exports`) keeps resolving through the stale entry. Restarting the server
// was the only cure, and the agent isn't allowed to do that.
//
// So every build batch runs in a fresh `bun` child: the child imports this
// module as its entry, receives one `BuildRequest` over IPC, compiles each job
// with `buildApplet`, writes the bundle dirs, and replies with a
// `BuildResponse`. A cold child costs ~150ms, almost all of it importing this
// module's graph (bun-plugin-tailwind, applet-css, @babel/parser) — and a
// crash inside Bun's bundler no longer takes the server down with it.
//
// Lifecycle: the child never exits on its own after replying. `process.exit`
// right after `process.send` drops the message once it outgrows the IPC pipe
// buffer (~1MB — a handful of failed applets with long Bun diagnostics gets
// there), so the parent kills the child once the result has arrived. The
// child exits by itself only when the parent is gone: on IPC `disconnect`,
// or when its parent pid changes (a crashed/SIGKILLed server never sends
// disconnect, but the orphan is reparented). Live children are tracked so the
// server's shutdown path can kill them — an untracked build outliving a dev
// restart would keep rewriting `.build/` under the replacement server.
//
// `buildApplet` itself stays in-process-capable: tests call it directly, and
// nothing here changes its contract.
import { mkdir, rm } from 'node:fs/promises'
import { join } from 'path'

import type { AppletKind, ViewConfig, WidgetConfig } from '@/lib/types'

import { buildApplet } from './build-applet'

export type BuildJob = {
  name: string
  // Absolute path of the applet's entry source (`.moi/<kind>/<name>.tsx`).
  srcPath: string
  // Absolute bundle directory to (re)create: `.moi/.build/<kind>/<name>/`.
  outDir: string
}

export type BuildJobResult = {
  name: string
  status: 'built' | 'failed'
  error?: string
  serverModules?: string[]
  config?: WidgetConfig | ViewConfig | null
}

export type BuildRequest = {
  type: 'build'
  moiRoot: string
  kind: AppletKind
  jobs: BuildJob[]
}

export type BuildResponse = {
  type: 'result'
  results: BuildJobResult[]
}

const WORKER_PATH = join(import.meta.dir, 'build-worker.ts')

// Children currently compiling a batch, for `killBuildWorkers()`.
const liveWorkers = new Set<ReturnType<typeof Bun.spawn>>()

// How many build children are alive right now (tests assert none leak).
export function liveBuildWorkerCount(): number {
  return liveWorkers.size
}

// Kill every in-flight build child. Called from the server's shutdown path
// (SIGTERM from the dev supervisor, Ctrl-C) alongside the function-worker pool
// so a half-done bundle can't keep writing after the server is gone. Pending
// batches settle as failed through `onExit`.
export function killBuildWorkers(): void {
  for (const proc of liveWorkers) proc.kill()
  liveWorkers.clear()
}

// Compile every job and write its bundle dir. Runs inside the child, but is a
// plain function so the batch semantics (parallel jobs, per-job failure
// isolation, clear-then-write) are testable without spawning.
export async function runBuildJobs(req: BuildRequest): Promise<BuildJobResult[]> {
  return Promise.all(
    req.jobs.map(async (job): Promise<BuildJobResult> => {
      try {
        const artifact = await buildApplet(job.srcPath, req.moiRoot, req.kind)
        // Clear the dir first so stale hashed assets from a prior build don't
        // accumulate, then write the fresh entry + chunks + assets.
        await rm(job.outDir, { recursive: true, force: true })
        await mkdir(job.outDir, { recursive: true })
        for (const f of artifact.files) {
          await Bun.write(join(job.outDir, f.name), f.data)
        }
        return {
          name: job.name,
          status: 'built',
          serverModules: artifact.serverModules.map(m => m.name),
          config: artifact.config
        }
      } catch (err) {
        return {
          name: job.name,
          status: 'failed',
          error: err instanceof Error ? err.message : 'Unknown error'
        }
      }
    })
  )
}

// Host side: spawn a fresh child for one batch and collect its results. The
// child inherits cwd and env, so resolution behaves exactly as the in-process
// build did (see the `devalue` and `serverCwd` notes in build-applet.ts) —
// minus the poisoned cache. A child that dies before replying fails every job
// in the batch with its exit code rather than hanging the caller.
export function buildAppletsInChild(req: Omit<BuildRequest, 'type'>): Promise<BuildJobResult[]> {
  if (req.jobs.length === 0) return Promise.resolve([])
  return new Promise(resolve => {
    let settled = false
    const settle = (results: BuildJobResult[]) => {
      if (settled) return
      settled = true
      resolve(results)
    }
    const request: BuildRequest = { type: 'build', ...req }
    const proc = Bun.spawn([process.execPath, WORKER_PATH], {
      stdio: ['ignore', 'inherit', 'inherit'],
      serialization: 'json',
      ipc(message, child) {
        const msg = message as Partial<BuildResponse>
        if (msg.type !== 'result' || !Array.isArray(msg.results)) return
        settle(msg.results)
        // The result is in hand — the child has nothing left to do (see the
        // lifecycle note above for why it doesn't exit on its own).
        liveWorkers.delete(child)
        child.kill()
      },
      onExit(child, code, signal) {
        liveWorkers.delete(child)
        const why = signal ? `signal ${signal}` : `code ${code}`
        settle(
          req.jobs.map(job => ({
            name: job.name,
            status: 'failed',
            error: `Build worker exited (${why}) before reporting a result`
          }))
        )
      }
    })
    liveWorkers.add(proc)
    proc.send(request)
  })
}

if (import.meta.main) {
  // Orphan guards — the only ways the child ends itself. See the lifecycle
  // note at the top: the parent kills us after it has read the result.
  const parentPid = process.ppid
  process.on('disconnect', () => process.exit(0))
  setInterval(() => {
    if (process.ppid !== parentPid) process.exit(0)
  }, 500)

  process.on('message', async message => {
    const req = message as Partial<BuildRequest>
    if (req.type !== 'build' || !Array.isArray(req.jobs)) return
    const results = await runBuildJobs(req as BuildRequest)
    const response: BuildResponse = { type: 'result', results }
    process.send?.(response)
  })
}
