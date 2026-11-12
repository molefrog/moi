import { defineCommand } from 'citty'
import { mkdir, rename, rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { z } from 'zod'
import { operation } from '../remote/client'
import { currentRemoteWorkspace } from '../remote/workspace'

const path = { type: 'string' as const, description: 'Local linked workspace folder' }
const json = { type: 'boolean' as const, description: 'Print JSON result' }
const commandResult = z.object({
  exitCode: z.number().int(),
  stdout: z.string(),
  stderr: z.string()
})
async function printCommandResult(response: Response, json = false) {
  const result = commandResult.parse(await response.json())
  if (json) console.log(JSON.stringify(result))
  else {
    process.stdout.write(result.stdout)
    process.stderr.write(result.stderr)
  }
  process.exitCode = result.exitCode < 0 ? 1 : result.exitCode
}

/** Ordinary workspace commands can use the folder's remote link automatically. */
export async function runLinkedWorkspaceCommand(command: string, args: string[], folder: string) {
  const linked = await currentRemoteWorkspace(folder)
  if (!linked) return false
  const response = await operation(linked.user_id, linked.workspace_id, '/commands', {
    method: 'POST',
    body: JSON.stringify({ command, args }),
    contentType: 'application/json'
  })
  await printCommandResult(response)
  return true
}
const execEvent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('stdout'), data: z.string() }),
  z.object({ type: z.literal('stderr'), data: z.string() }),
  z.object({ type: z.literal('exit'), code: z.number().int() })
])
const fileSuffix = (value: string) => {
  if (
    !value ||
    value.startsWith('/') ||
    value.includes('\\') ||
    value.split('/').some(p => p === '.' || p === '..' || !p)
  )
    throw new Error('Use a file path relative to the remote workspace')
  return '/files/' + value.split('/').map(encodeURIComponent).join('/')
}
async function target(folder?: string) {
  const current = await currentRemoteWorkspace(folder)
  if (!current) throw new Error('This folder is not linked — run moi remote link first')
  return (suffix: string, options?: Parameters<typeof operation>[3]) =>
    operation(current.user_id, current.workspace_id, suffix, options)
}
async function stdin() {
  if (process.stdin.isTTY) throw new Error('Supply content or pipe it on stdin')
  return Bun.stdin.text()
}

export function remoteOperations(report: (action: () => Promise<void>) => Promise<void>) {
  const read = defineCommand({
    meta: { name: 'read', description: 'Read a remote workspace file to stdout' },
    args: { file: { type: 'positional', required: true }, path },
    run: ({ args }) =>
      report(async () => {
        const response = await (await target(args.path))(fileSuffix(args.file))
        if (response.body)
          for await (const chunk of response.body) await Bun.write(Bun.stdout, chunk)
      })
  })
  const write = defineCommand({
    meta: { name: 'write', description: 'Write a remote file; content argument or stdin' },
    args: {
      file: { type: 'positional', required: true },
      content: { type: 'positional', required: false },
      path,
      json
    },
    run: ({ args }) =>
      report(async () => {
        const response = await (
          await target(args.path)
        )(fileSuffix(args.file), {
          method: 'PUT',
          body: args.content ?? (await stdin()),
          contentType: 'application/octet-stream'
        })
        console.log(args.json ? JSON.stringify(await response.json()) : `Wrote ${args.file}`)
      })
  })
  const patch = defineCommand({
    meta: {
      name: 'patch',
      description: 'Apply a unified diff to a remote file (stdin or --patch-file)'
    },
    args: {
      file: { type: 'positional', required: true },
      'patch-file': { type: 'string' },
      path,
      json
    },
    run: ({ args }) =>
      report(async () => {
        const diff = args['patch-file']
          ? await Bun.file(resolve(args['patch-file'])).text()
          : await stdin()
        const response = await (
          await target(args.path)
        )(fileSuffix(args.file), {
          method: 'PATCH',
          body: JSON.stringify({ patch: diff }),
          contentType: 'application/json'
        })
        console.log(args.json ? JSON.stringify(await response.json()) : `Patched ${args.file}`)
      })
  })
  const upload = defineCommand({
    meta: { name: 'file-upload', description: 'Upload a local file to a remote workspace path' },
    args: {
      source: { type: 'positional', required: true },
      destination: { type: 'positional', required: true },
      path,
      json
    },
    run: ({ args }) =>
      report(async () => {
        const file = Bun.file(resolve(args.source))
        if (!(await file.exists())) throw new Error('Local source file not found')
        const response = await (
          await target(args.path)
        )(fileSuffix(args.destination), {
          method: 'PUT',
          body: file,
          contentType: 'application/octet-stream'
        })
        console.log(
          args.json ? JSON.stringify(await response.json()) : `Uploaded ${args.destination}`
        )
      })
  })
  const download = defineCommand({
    meta: {
      name: 'file-download',
      description: 'Download a remote workspace file to a local path'
    },
    args: {
      source: { type: 'positional', required: true },
      destination: { type: 'positional', required: true },
      path,
      json
    },
    run: ({ args }) =>
      report(async () => {
        const response = await (await target(args.path))(fileSuffix(args.source))
        const destination = resolve(args.destination),
          temporary = `${destination}.${crypto.randomUUID()}.tmp`
        await mkdir(dirname(destination), { recursive: true })
        try {
          await Bun.write(temporary, response)
          await rename(temporary, destination)
        } finally {
          await rm(temporary, { force: true })
        }
        console.log(
          args.json
            ? JSON.stringify({ ok: true, path: destination })
            : `Downloaded ${args.destination}`
        )
      })
  })
  const exec = defineCommand({
    meta: {
      name: 'exec',
      description: 'Run a shell command on the remote host, in this workspace'
    },
    args: { command: { type: 'positional', required: true }, path, json },
    run: ({ args }) =>
      report(async () => {
        const controller = new AbortController()
        const request = await target(args.path)
        const id = crypto.randomUUID()
        let cancellation: Promise<void> | undefined
        const interrupt = () => {
          cancellation ??= request('/exec', {
            method: 'POST',
            body: JSON.stringify({ cancel: id }),
            contentType: 'application/json',
            signal: AbortSignal.timeout(10_000)
          })
            .then(async response => {
              await response.body?.cancel()
            })
            .catch(() => {
              console.error('Could not confirm the remote command stopped')
            })
            .finally(() => controller.abort())
        }
        process.once('SIGINT', interrupt)
        try {
          const response = await request('/exec', {
            method: 'POST',
            body: JSON.stringify({ command: args.command, id }),
            contentType: 'application/json',
            signal: controller.signal
          })
          if (!response.body) throw new Error('Remote execution returned no stream')
          let pending = '',
            exit: number | undefined
          const decoder = new TextDecoder()
          for await (const chunk of response.body) {
            pending += decoder.decode(chunk, { stream: true })
            let end: number
            while ((end = pending.indexOf('\n')) !== -1) {
              const line = pending.slice(0, end)
              pending = pending.slice(end + 1)
              const event = execEvent.parse(JSON.parse(line))
              if (args.json) console.log(JSON.stringify(event))
              if (event.type === 'exit') exit = event.code
              else if (!args.json)
                (event.type === 'stdout' ? process.stdout : process.stderr).write(event.data)
            }
          }
          if (exit === undefined || pending)
            throw new Error(
              'Remote execution disconnected before the exit code; command may still have run'
            )
          process.exitCode = exit < 0 ? 1 : exit
        } catch (error) {
          if (!cancellation) throw error
        } finally {
          process.removeListener('SIGINT', interrupt)
          await cancellation
          if (cancellation) process.exitCode = 130
        }
      })
  })
  return { read, write, patch, exec, 'file-upload': upload, 'file-download': download }
}
