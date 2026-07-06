// MEI Functions Worker — child process that loads and executes .server.ts modules.
// Spawned by the main process with IPC. Receives call/reload messages.
import { parse, stringify } from 'devalue'
import { join, resolve, sep } from 'path'

import type { McpServerSummary, McpToolInfo, McpToolResult } from './mcp-broker'

const MEI_DIR =
  process.env.MEI_FUNCTIONS_DIR ?? join(import.meta.dir, '..', 'test-workspace', '.moi')

// The parent spawns us from a neutral cwd so Bun never auto-loads the
// workspace's `.env` into this process — moi injects the resolved, scope-filtered
// env at spawn instead (see functions.ts). Restore the documented
// `cwd = workspace root` so server functions can use plain relative paths.
if (process.env.MEI_WORKSPACE_ROOT) {
  try {
    process.chdir(process.env.MEI_WORKSPACE_ROOT)
  } catch {}
}

const moduleCache = new Map<string, Record<string, unknown>>()

function send(msg: unknown) {
  try {
    process.send!(msg)
  } catch {
    // IPC channel closed — parent died
  }
}

// ---- MCP bridge (worker side) ----------------------------------------------
// Server functions call the user's Claude Code MCP tools via `mcp` from the
// virtual 'moi' module below. The actual connections live in the PARENT
// (server/mcp-broker.ts) so they're pooled across worker restarts; this side
// only relays requests over IPC and awaits the matching 'mcp-result'.

// Slightly above the parent-side tool-call ceiling (25s) so the descriptive
// broker error wins the race against this transport-level guard.
const MCP_REQUEST_TIMEOUT_MS = 28_000

type McpPending = {
  resolve: (data: unknown) => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout>
}
const mcpPending = new Map<string, McpPending>()

function mcpRequest(
  op: 'callTool' | 'listTools' | 'listServers',
  params: { server?: string; tool?: string; args?: Record<string, unknown> } = {}
): Promise<unknown> {
  if (!process.send) {
    return Promise.reject(new Error('MCP is unavailable: worker has no IPC channel'))
  }
  const id = crypto.randomUUID()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      mcpPending.delete(id)
      reject(new Error(`MCP ${op} timed out`))
    }, MCP_REQUEST_TIMEOUT_MS)
    mcpPending.set(id, { resolve, reject, timer })
    send({ type: 'mcp', id, op, ...params })
  })
}

const mcp = {
  callTool(server: string, tool: string, args?: Record<string, unknown>): Promise<McpToolResult> {
    return mcpRequest('callTool', { server, tool, args }) as Promise<McpToolResult>
  },
  listTools(server: string): Promise<McpToolInfo[]> {
    return mcpRequest('listTools', { server }) as Promise<McpToolInfo[]>
  },
  listServers(): Promise<McpServerSummary[]> {
    return mcpRequest('listServers') as Promise<McpServerSummary[]>
  }
}

// The virtual 'moi' module, mirroring the client-side one the bundler provides
// to .tsx applets (build-applet.ts). Registered before any .server.ts import
// so `import { mcp } from 'moi'` resolves inside server functions.
Bun.plugin({
  name: 'moi-server-runtime',
  setup(build) {
    build.module('moi', () => ({
      loader: 'object',
      exports: {
        mcp,
        fileUrl: () => {
          throw new Error(
            'fileUrl() is client-only — return the path from the server function and call fileUrl(path) in the component'
          )
        }
      }
    }))
  }
})

async function loadModule(name: string): Promise<Record<string, unknown>> {
  const cached = moduleCache.get(name)
  if (cached) return cached

  // Module keys are paths relative to MEI_DIR (the workspace's `.moi/`),
  // e.g. "widgets/hello". Defense-in-depth: the route already rejects `..`
  // segments, but never load a file that resolves outside MEI_DIR.
  const filePath = join(MEI_DIR, `${name}.server.ts`)
  if (!resolve(filePath).startsWith(resolve(MEI_DIR) + sep)) {
    throw new Error(`Server module "${name}" not found`)
  }
  const file = Bun.file(filePath)

  if (!(await file.exists())) {
    throw new Error(`Server module "${name}" not found`)
  }

  const mod = (await import(filePath + `?t=${file.lastModified}`)) as Record<string, unknown>
  moduleCache.set(name, mod)
  // Tell the parent what's cached here — introspection only, shown in /status.
  send({ type: 'loaded', module: name })
  return mod
}

async function evictModule(name: string) {
  const mod = moduleCache.get(name)
  if (!mod) return

  if (typeof mod.dispose === 'function') {
    try {
      await (mod.dispose as () => Promise<void>)()
    } catch (err) {
      console.error(`[mei] dispose error in ${name}.server.ts:`, err)
    }
  }

  moduleCache.delete(name)
}

type CallMessage = { id: string; type: 'call'; module: string; name: string; args: string }
type ReloadMessage = { type: 'reload'; modules: string[] }
type McpResultMessage = {
  type: 'mcp-result'
  id: string
  ok: boolean
  data?: unknown
  message?: string
}
type IncomingMessage = CallMessage | ReloadMessage | McpResultMessage

process.on('message', async (raw: IncomingMessage) => {
  if (raw.type === 'mcp-result') {
    const pending = mcpPending.get(raw.id)
    if (!pending) return
    mcpPending.delete(raw.id)
    clearTimeout(pending.timer)
    if (raw.ok) pending.resolve(raw.data)
    else pending.reject(new Error(raw.message ?? 'Unknown MCP error'))
    return
  }

  if (raw.type === 'reload') {
    for (const name of raw.modules) {
      await evictModule(name)
    }
    return
  }

  if (raw.type === 'call') {
    const { id, module: moduleName, name, args } = raw

    if (!id || !moduleName || !name) {
      send({ id, type: 'error', message: 'Malformed call message' })
      return
    }

    try {
      const mod = await loadModule(moduleName)
      const fn = mod[name]

      if (typeof fn !== 'function') {
        throw new Error(`"${name}" in ${moduleName}.server.ts is not a function`)
      }

      const parsedArgs = parse(args) as unknown[]
      const result = await fn(...parsedArgs)

      send({ id, type: 'result', data: stringify(result) })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      send({ id, type: 'error', message })
    }
  }
})

send({ type: 'ready' })
