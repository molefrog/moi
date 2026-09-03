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
// with `buildApplet`, writes the bundle dirs, replies with a `BuildResponse`,
// and exits. A cold child costs ~150ms, almost all of it importing this
// module's graph (bun-plugin-tailwind, applet-css, @babel/parser) — and a
// crash inside Bun's bundler no longer takes the server down with it.
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
      ipc(message) {
        const msg = message as Partial<BuildResponse>
        if (msg.type === 'result' && Array.isArray(msg.results)) settle(msg.results)
      },
      onExit(_proc, code, signal) {
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
    proc.send(request)
  })
}

if (import.meta.main) {
  process.on('message', async message => {
    const req = message as Partial<BuildRequest>
    if (req.type !== 'build' || !Array.isArray(req.jobs)) return
    const results = await runBuildJobs(req as BuildRequest)
    const response: BuildResponse = { type: 'result', results }
    process.send?.(response)
    process.exit(0)
  })
}
