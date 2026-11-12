import { chmod, rm } from 'node:fs/promises'
import { z } from 'zod'
import { getWorkspace } from '../workspaces/registry'
import { applyUnifiedPatch, OperationError, workspaceFile, writeWorkspaceFile } from './files'
import { spawnWorkspaceCommand } from './commands'

const executionId = z.string().uuid()
const execSchema = z.union([
  z.object({ command: z.string().min(1).max(100_000), id: executionId.optional() }).strict(),
  z.object({ cancel: executionId }).strict()
])
const commandSchema = z
  .object({ command: z.string(), args: z.array(z.string().max(100_000)).max(500).default([]) })
  .strict()
const patchSchema = z
  .object({
    patch: z
      .string()
      .min(1)
      .max(4 * 1024 * 1024)
  })
  .strict()
const processes = new Set<Bun.Subprocess>()
function stopChild(child: Bun.Subprocess) {
  try {
    process.kill(-child.pid, 'SIGKILL')
  } catch {
    child.kill('SIGKILL')
  }
}
async function readOutput(source: ReadableStream<Uint8Array>, child: Bun.Subprocess) {
  const chunks: Uint8Array[] = []
  let size = 0
  for await (const chunk of source) {
    size += chunk.byteLength
    if (size > 8 * 1024 * 1024) {
      stopChild(child)
      throw new OperationError('Command output exceeded 8 MiB; use exec for streaming', 413)
    }
    chunks.push(chunk)
  }
  return new TextDecoder().decode(Buffer.concat(chunks))
}

function track(child: Bun.Subprocess, signal: AbortSignal) {
  processes.add(child)
  const stop = () => stopChild(child)
  signal.addEventListener('abort', stop, { once: true })
  if (signal.aborted) stop()
  void child.exited.finally(() => {
    processes.delete(child)
    signal.removeEventListener('abort', stop)
  })
}
export function stopOperations() {
  for (const child of processes) stopChild(child)
}

// Distinct listener: these handlers are never mounted on the browser API.
export function createOperationsHandler(resolveWorkspace = getWorkspace) {
  const executions = new Map<string, Bun.Subprocess>()
  const cancelled = new Map<string, number>()
  return async (request: Request): Promise<Response> => {
    try {
      const url = new URL(request.url)
      const match = /^\/workspaces\/([A-Za-z0-9_-]+)\/(files\/(.+)|exec|commands)$/.exec(
        url.pathname
      )
      if (!match) return Response.json({ error: 'Not found' }, { status: 404 })
      const workspace = await resolveWorkspace(match[1]!)
      if (!workspace || workspace.remote)
        return Response.json({ error: 'Workspace unavailable' }, { status: 404 })
      const root = workspace.path
      if (match[3]) {
        const path = decodeURIComponent(match[3])
        if (request.method === 'GET' || request.method === 'HEAD') {
          const file = Bun.file(await workspaceFile(root, path))
          return new Response(request.method === 'HEAD' ? null : file, {
            headers: {
              'content-type': file.type,
              'content-length': String(file.size),
              'cache-control': 'no-store'
            }
          })
        }
        if (request.method === 'PUT') {
          return Response.json(
            await writeWorkspaceFile(root, path, request.body ?? new Blob([]).stream())
          )
        }
        if (request.method === 'PATCH') {
          const { patch } = patchSchema.parse(await request.json())
          return Response.json(
            await writeWorkspaceFile(root, path, new ReadableStream(), source =>
              applyUnifiedPatch(source, patch)
            )
          )
        }
      }
      if (request.method !== 'POST')
        return Response.json({ error: 'Method not allowed' }, { status: 405 })
      if (match[2] === 'commands') {
        const { command, args } = commandSchema.parse(await request.json())
        const child = spawnWorkspaceCommand(root, command, args)
        track(child, request.signal)
        const [stdout, stderr, exitCode] = await Promise.all([
          readOutput(child.stdout, child),
          readOutput(child.stderr, child),
          child.exited
        ])
        return Response.json({ exitCode, stdout, stderr })
      }
      if (match[2] === 'exec') {
        const input = execSchema.parse(await request.json())
        const key = JSON.stringify([
          workspace.id,
          request.headers.get('x-moi-user-id'),
          'cancel' in input ? input.cancel : input.id
        ])
        for (const [id, expires] of cancelled) if (expires < Date.now()) cancelled.delete(id)
        if ('cancel' in input) {
          // Retain a short cancellation marker in case it overtakes startup.
          cancelled.set(key, Date.now() + 60_000)
          const running = executions.get(key)
          if (running) stopChild(running)
          return Response.json({ cancelled: true })
        }
        if (cancelled.has(key)) throw new OperationError('Execution was cancelled', 409)
        if (input.id && executions.has(key))
          throw new OperationError('Execution already exists', 409)
        const { command } = input
        const child = Bun.spawn(['/bin/sh', '-c', command], {
          cwd: root,
          stdin: 'ignore',
          stdout: 'pipe',
          stderr: 'pipe',
          detached: true
        })
        track(child, request.signal)
        if (input.id) {
          executions.set(key, child)
          void child.exited.finally(() => executions.delete(key))
        }
        const encoder = new TextEncoder()
        const stream = new TransformStream<Uint8Array, Uint8Array>()
        const writer = stream.writable.getWriter()
        const send = (event: unknown) => writer.write(encoder.encode(JSON.stringify(event) + '\n'))
        const read = async (type: string, source: ReadableStream<Uint8Array>) => {
          const decoder = new TextDecoder()
          for await (const bytes of source)
            await send({ type, data: decoder.decode(bytes, { stream: true }) })
          const tail = decoder.decode()
          if (tail) await send({ type, data: tail })
        }
        void writer.closed.catch(() => stopChild(child))
        void Promise.all([read('stdout', child.stdout), read('stderr', child.stderr), child.exited])
          .then(async ([, , code]) => {
            await send({ type: 'exit', code })
            await writer.close()
          })
          .catch(async error => {
            stopChild(child)
            await writer.abort(error).catch(() => {})
          })
        return new Response(stream.readable, {
          headers: {
            'content-type': 'application/x-ndjson',
            'cache-control': 'no-store, no-transform',
            'content-encoding': 'identity',
            'x-content-type-options': 'nosniff'
          }
        })
      }
      return Response.json({ error: 'Method not allowed' }, { status: 405 })
    } catch (error) {
      const status =
        error instanceof OperationError
          ? error.status
          : error instanceof z.ZodError || error instanceof SyntaxError || error instanceof URIError
            ? 400
            : 500
      if (status === 500) console.error('[operations]', error)
      return Response.json(
        {
          error:
            error instanceof OperationError
              ? error.message
              : status === 400
                ? 'Invalid operation request'
                : 'Operation failed'
        },
        { status }
      )
    }
  }
}
export async function startOperations(socket: string) {
  await rm(socket, { force: true })
  const server = Bun.serve({
    ...({ unix: socket } as unknown as { port: number }),
    idleTimeout: 0,
    fetch: createOperationsHandler()
  })
  await chmod(socket, 0o660)
  return server
}
