// MEI Functions Worker — child process that loads and executes .server.ts modules.
// Spawned by the main process with IPC. Receives call/reload messages.
import { parse, stringify } from 'devalue'
import { join, resolve, sep } from 'path'

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
type IncomingMessage = CallMessage | ReloadMessage

process.on('message', async (raw: IncomingMessage) => {
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
