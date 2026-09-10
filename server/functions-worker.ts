// MEI Functions Worker — child process that loads and executes .server.ts modules.
// Spawned by the main process with IPC. Receives call/reload messages.
import { parse, stringify } from 'devalue'
import { join, resolve, sep } from 'path'
import { prepareTool } from '../lib/tool-execution'
import { isRecord } from '../lib/tools'

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

async function loadModule(name: string, optional = false): Promise<Record<string, unknown>> {
  // Module keys are paths relative to MEI_DIR (the workspace's `.moi/`),
  // e.g. "widgets/hello". Defense-in-depth: the route already rejects `..`
  // segments, but never load a file that resolves outside MEI_DIR.
  const filePath = join(MEI_DIR, `${name}.server.ts`)
  if (!resolve(filePath).startsWith(resolve(MEI_DIR) + sep)) {
    throw new Error(`Server module "${name}" not found`)
  }
  const file = Bun.file(filePath)

  if (!(await file.exists())) {
    if (optional) {
      await evictModule(name)
      return {}
    }
    throw new Error(`Server module "${name}" not found`)
  }

  const cached = moduleCache.get(name)
  if (cached) return cached

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
type ShutdownMessage = { type: 'shutdown' }
type ToolMessage = {
  id: string
  type: 'list-tools' | 'call-tool'
  module: string
  name: string
  args: string
}
type IncomingMessage =
  | CallMessage
  | ReloadMessage
  | ShutdownMessage
  | ToolMessage
  | { type: 'cancel-tool'; id: string }
const toolCalls = new Map<string, AbortController>()

process.on('message', async (raw: IncomingMessage) => {
  if (raw.type === 'cancel-tool') {
    toolCalls.get(raw.id)?.abort()
    return
  }
  if (raw.type === 'list-tools' || raw.type === 'call-tool') {
    const controller = new AbortController()
    toolCalls.set(raw.id, controller)
    try {
      const mod = await loadModule(raw.module, raw.type === 'list-tools')
      if (mod.tools !== undefined && !isRecord(mod.tools))
        throw new Error('The tools export must be an object.')
      const tools = new Map(
        Object.entries(mod.tools ?? {}).map(([name, value]) => {
          if (!isRecord(value)) throw new Error(`Invalid server tool: ${name}`)
          return [name, prepareTool({ ...value, name })] as const
        })
      )
      if (raw.type === 'list-tools') {
        send({
          id: raw.id,
          type: 'result',
          data: stringify([...tools.values()].map(tool => tool.descriptor))
        })
      } else {
        const tool = tools.get(raw.name)
        if (!tool) throw new Error(`Unknown server tool: ${raw.name}`)
        const result = await tool.call(parse(raw.args), controller.signal)
        send({ id: raw.id, type: 'result', data: stringify(result) })
      }
    } catch (error) {
      send({
        id: raw.id,
        type: 'error',
        message: error instanceof Error ? error.message : String(error)
      })
    } finally {
      toolCalls.delete(raw.id)
    }
    return
  }

  if (raw.type === 'reload') {
    for (const name of raw.modules) {
      await evictModule(name)
    }
    return
  }

  // Graceful exit. The parent kills this process to pick up edited server code
  // — evicting from moduleCache isn't enough, because a module's own imports
  // are pinned in Bun's ESM registry with no way to invalidate them (the
  // `?t=` buster below only busts the .server.ts itself, one level deep). Run
  // every cached module's `dispose()` first so a hard kill doesn't strand a db
  // handle or timer; the parent hard-kills us if we take too long.
  if (raw.type === 'shutdown') {
    for (const name of [...moduleCache.keys()]) {
      await evictModule(name)
    }
    process.exit(0)
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
